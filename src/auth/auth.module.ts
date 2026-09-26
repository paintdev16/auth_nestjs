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
import { EmailVerificationTokensService } from './email-verification-tokens.service.js';
import { TokenCleanupService } from './token-cleanup.service.js';

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
          expiresIn:
            configService.get<'15m' | '30m' | '1h'>('JWT_ACCESS_TTL') ?? '15m',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    RefreshTokensService,
    PasswordResetTokensService,
    EmailVerificationTokensService,
    TokenCleanupService,
    PasswordResetMailerService,
    LocalStrategy,
    JwtStrategy,
  ],
})
export class AuthModule {}
