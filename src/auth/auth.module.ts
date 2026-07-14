import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { BearerAuthGuard } from './guards/bearer-auth.guard';
import { User } from './entities/user.entity';
import { AuthSession } from './entities/auth-session.entity';
import { SignupIpEvent } from './entities/signup-ip-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuthSession, SignupIpEvent])],
  controllers: [AuthController],
  providers: [AuthService, BearerAuthGuard, AccessTokenGuard],
  exports: [AuthService, BearerAuthGuard, AccessTokenGuard],
})
export class AuthModule {}
