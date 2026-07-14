import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminService } from './admin.service';

/**
 * Protects admin endpoints. Requires a valid access token (issued by the real
 * auth flow) whose account still holds the admin role and is not blocked.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Admin login is required.');
    }

    try {
      request.auth = this.authService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired admin session.');
    }

    await this.adminService.assertAdmin(request.auth.sub);
    return true;
  }

  /**
   * Reads the token from the Authorization header (fetch calls) or a `token`
   * query param — needed for `<img>` screenshot requests, which cannot set headers.
   */
  private extractToken(request: AuthenticatedRequest): string | null {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }

    const queryToken = request.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return null;
  }
}
