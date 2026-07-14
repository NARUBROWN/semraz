import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { User } from './entities/user.entity';
import { AuthSession } from './entities/auth-session.entity';
import { SignupIpEvent } from './entities/signup-ip-event.entity';
import { AccessTokenPayload } from './auth.types';
import { LoginBody, RefreshBody, SignupBody } from './dto/auth.dto';

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

@Injectable()
export class AuthService {
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlDays: number;
  private readonly signupIpCooldownMs = 3 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly sessionsRepository: Repository<AuthSession>,
    @InjectRepository(SignupIpEvent)
    private readonly signupIpEventsRepository: Repository<SignupIpEvent>,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenTtlSeconds = Number(
      this.configService.get('JWT_ACCESS_TOKEN_TTL_SECONDS') ?? 900,
    );
    this.refreshTokenTtlDays = Number(
      this.configService.get('JWT_REFRESH_TOKEN_TTL_DAYS') ?? 14,
    );
  }

  async signup(body: SignupBody, ipAddress: string): Promise<AuthResult> {
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name || !email || !body.password) {
      throw new BadRequestException('Name, email, and password are required.');
    }

    this.assertValidEmail(email);
    this.assertStrongPassword(body.password, { email, name });

    if (!(await this.isEmailAvailable(email))) {
      throw new ConflictException('Email is already registered.');
    }

    await this.assertSignupIpAllowed(ipAddress);

    const user = this.usersRepository.create({
      name,
      email,
      passwordHash: await bcrypt.hash(body.password, 12),
      role: 'owner',
    });

    await this.usersRepository.save(user);
    await this.signupIpEventsRepository.save(
      this.signupIpEventsRepository.create({
        ipAddress,
        userId: user.id,
      }),
    );

    return this.createSessionTokens(user);
  }

  async checkEmailAvailability(email?: string) {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException('Email is required.');
    }

    this.assertValidEmail(normalizedEmail);

    return {
      email: normalizedEmail,
      available: await this.isEmailAvailable(normalizedEmail),
    };
  }

  async login(body: LoginBody): Promise<AuthResult> {
    const email = body.email?.trim().toLowerCase();

    if (!email || !body.password) {
      throw new UnauthorizedException('Email and password are required.');
    }

    const user = await this.usersRepository.findOneBy({ email });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status === 'blocked') {
      throw new ForbiddenException('This account has been blocked.');
    }

    return this.createSessionTokens(user);
  }

  async assertActiveUser(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.status === 'blocked') {
      throw new ForbiddenException('This account has been blocked.');
    }
  }

  async refresh(body: RefreshBody): Promise<AuthResult> {
    if (!body.refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const payload = this.verifyRefreshToken(body.refreshToken);
    const session = await this.sessionsRepository.findOne({
      where: { id: payload.sid },
      relations: { user: true },
    });

    if (!session || session.userId !== payload.sub || session.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      session.revokedAt = new Date();
      await this.sessionsRepository.save(session);
      throw new UnauthorizedException('Refresh token expired.');
    }

    const matchesCurrentToken = this.compareRefreshTokenHash(
      body.refreshToken,
      session.refreshTokenHash,
    );

    if (!matchesCurrentToken) {
      session.revokedAt = new Date();
      await this.sessionsRepository.save(session);
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    return this.rotateRefreshToken(session);
  }

  async logout(sessionId: string) {
    await this.sessionsRepository.update(
      { id: sessionId },
      { revokedAt: new Date() },
    );
  }

  async findUserById(userId: string) {
    const user = await this.usersRepository.findOneBy({ id: userId });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return this.toPublicUser(user);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, this.getAccessTokenSecret()) as AccessTokenPayload;
  }

  private async createSessionTokens(user: User): Promise<AuthResult> {
    const session = this.sessionsRepository.create({
      id: uuidv7(),
      userId: user.id,
      expiresAt: this.addDays(new Date(), this.refreshTokenTtlDays),
    });

    return this.issueTokens(user, session);
  }

  private async rotateRefreshToken(session: AuthSession): Promise<AuthResult> {
    session.refreshTokenVersion += 1;
    session.lastUsedAt = new Date();

    return this.issueTokens(session.user, session);
  }

  private async issueTokens(
    user: User,
    session: AuthSession,
  ): Promise<AuthResult> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: session.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, this.getAccessTokenSecret(), {
      expiresIn: this.accessTokenTtlSeconds,
    });
    const refreshToken = jwt.sign(
      {
        sub: user.id,
        sid: session.id,
        ver: session.refreshTokenVersion,
      },
      this.getRefreshTokenSecret(),
      { expiresIn: `${this.refreshTokenTtlDays}d` },
    );

    session.refreshTokenHash = this.hashRefreshToken(refreshToken);
    await this.sessionsRepository.save(session);

    return {
      accessToken,
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  private verifyRefreshToken(refreshToken: string) {
    return jwt.verify(refreshToken, this.getRefreshTokenSecret()) as {
      sub: string;
      sid: string;
      ver: number;
    };
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private compareRefreshTokenHash(refreshToken: string, expectedHash: string) {
    const actualHash = this.hashRefreshToken(refreshToken);
    const actualBuffer = Buffer.from(actualHash);
    const expectedBuffer = Buffer.from(expectedHash);

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private async assertSignupIpAllowed(ipAddress: string) {
    const cutoff = new Date(Date.now() - this.signupIpCooldownMs);
    const recentSignup = await this.signupIpEventsRepository.findOne({
      where: {
        ipAddress,
        createdAt: MoreThanOrEqual(cutoff),
      },
      order: { createdAt: 'DESC' },
    });

    if (recentSignup) {
      throw new HttpException(
        'This IP address can create one account every 3 days.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async isEmailAvailable(email: string) {
    return (await this.usersRepository.countBy({ email })) === 0;
  }

  private assertValidEmail(email: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Use a valid email address.');
    }
  }

  private assertStrongPassword(
    password: string,
    context: { email: string; name: string },
  ) {
    const normalizedPassword = password.toLowerCase();
    const localPart = context.email.split('@')[0]?.toLowerCase() ?? '';
    const normalizedName = context.name.toLowerCase();
    const commonPasswords = new Set([
      'password',
      'password1',
      '12345678',
      '123456789',
      'qwerty123',
      'semraz',
      'admin123',
    ]);

    if (password.length < 10) {
      throw new BadRequestException(
        'Password must be at least 10 characters long.',
      );
    }

    if (/\s/.test(password)) {
      throw new BadRequestException('Password cannot contain spaces.');
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException(
        'Password must include at least one letter and one number.',
      );
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestException(
        'Password must include at least one special character.',
      );
    }

    if (commonPasswords.has(normalizedPassword)) {
      throw new BadRequestException('Password is too common.');
    }

    if (
      (localPart.length >= 3 && normalizedPassword.includes(localPart)) ||
      (normalizedName.length >= 3 && normalizedPassword.includes(normalizedName))
    ) {
      throw new BadRequestException(
        'Password cannot include your name or email.',
      );
    }
  }

  private getAccessTokenSecret() {
    return (
      this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ??
      'local-access-token-secret'
    );
  }

  private getRefreshTokenSecret() {
    return (
      this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET') ??
      'local-refresh-token-secret'
    );
  }
}
