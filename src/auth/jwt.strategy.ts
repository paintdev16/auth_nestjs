import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../users/users.service.js';
import { USER_STATUS } from '../users/user-status.constants.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    configService: ConfigService,
  ) {
    const jwtSecret = configService.getOrThrow<string>('JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: number; email: string; ver: number }) {
    const user = await this.usersService.findById(payload.sub);

    if (
      !user ||
      user.authVersion !== payload.ver ||
      user.status !== USER_STATUS.ACTIVE ||
      !user.emailVerifiedAt
    ) {
      return null;
    }

    const authorization = await this.usersService.findAuthorizationByUserId(
      user.id,
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      ...authorization,
    };
  }
}
