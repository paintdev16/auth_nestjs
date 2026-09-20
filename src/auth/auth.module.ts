import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';

import { UsersModule } from '../users/users.module.js';
import { LOGIN_RATE_LIMIT } from './auth-rate-limit.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { LocalStrategy } from './local.strategy.js';
import { PasswordResetMailerService } from './password-reset-mailer.service.js';
import { PasswordResetTokensService } from './password-reset-tokens.service.js';

@Module({
  imports: [
    UsersModule,

    PassportModule.register({}),

    ThrottlerModule.forRoot([LOGIN_RATE_LIMIT]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '1h',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    RefreshTokensService,
    PasswordResetTokensService,
    PasswordResetMailerService,
    LocalStrategy,
    JwtStrategy,
  ],
})
export class AuthModule {}
