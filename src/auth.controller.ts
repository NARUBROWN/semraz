import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';

type LoginBody = {
  email?: string;
  password?: string;
};

const mockUser = {
  id: 'usr_livit',
  name: 'Semraz Builder',
  email: 'builder@semraz.dev',
  role: 'owner',
};

@Controller('api/auth')
export class AuthController {
  @Post('login')
  login(@Body() body: LoginBody) {
    if (!body.email || !body.password) {
      throw new UnauthorizedException('Email and password are required.');
    }

    return {
      accessToken: 'mock-semraz-token',
      user: {
        ...mockUser,
        email: body.email,
      },
    };
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    if (!authorization?.startsWith('Bearer mock-semraz-token')) {
      throw new UnauthorizedException('Missing mock auth token.');
    }

    return mockUser;
  }
}
