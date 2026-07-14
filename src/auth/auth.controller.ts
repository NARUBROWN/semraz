import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import type { LoginBody, RefreshBody, SignupBody } from './dto/auth.dto';
import { BearerAuthGuard } from './guards/bearer-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginBody) {
    return this.authService.login(body);
  }

  @Post('signup')
  signup(@Body() body: SignupBody, @Req() request: Request) {
    return this.authService.signup(body, this.getClientIp(request));
  }

  @Get('email-availability')
  checkEmailAvailability(@Query('email') email?: string) {
    return this.authService.checkEmailAvailability(email);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshBody) {
    return this.authService.refresh(body);
  }

  @Post('logout')
  @UseGuards(BearerAuthGuard)
  async logout(@Req() request: AuthenticatedRequest) {
    await this.authService.logout(request.auth!.sid);

    return { ok: true };
  }

  @Get('me')
  @UseGuards(BearerAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.findUserById(request.auth!.sub);
  }

  private getClientIp(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0];

    return (
      firstForwardedIp?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }
}
