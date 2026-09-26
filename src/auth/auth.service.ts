import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service.js';
import { PasswordResetMailerService } from './password-reset-mailer.service.js';
import { PasswordResetTokensService } from './password-reset-tokens.service.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import { EmailVerificationTokensService } from './email-verification-tokens.service.js';
import { USER_STATUS } from '../users/user-status.constants.js';

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
} as const;

type DatabaseError = {
  code?: unknown;
  cause?: unknown;
};

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const databaseError = error as DatabaseError;

  if (databaseError.code === '23505') {
    return true;
  }

  return isUniqueViolation(databaseError.cause);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly passwordResetTokensService: PasswordResetTokensService,
    private readonly passwordResetMailerService: PasswordResetMailerService,
    private readonly emailVerificationTokensService: EmailVerificationTokensService,
  ) {}

  async register(data: { email: string; password: string; name?: string }) {
    const email = this.normalizeEmail(data.email);
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('El correo ya está registrado');
    }

    const passwordHash = await argon2.hash(
      data.password,
      PASSWORD_HASH_OPTIONS,
    );

    try {
      const user = await this.usersService.create({
        email,
        password: passwordHash,
        name: data.name?.trim(),
      });

      const authorization = await this.usersService.findAuthorizationByUserId(
        user.id,
      );
      const verificationToken = await this.emailVerificationTokensService.issue(
        user.id,
      );
      await this.passwordResetMailerService.sendVerification(
        user.email,
        verificationToken,
      );

      return {
        ...this.toSafeUser(user),
        status: user.status,
        ...authorization,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('El correo ya está registrado');
      }

      throw error;
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(
      this.normalizeEmail(email),
    );

    if (!user) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const passwordIsValid = await argon2.verify(user.password, password);

    if (!passwordIsValid) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    if (user.status === USER_STATUS.PENDING_VERIFICATION) {
      throw new ForbiddenException(
        'Debes verificar tu correo antes de iniciar sesión',
      );
    }

    if (user.status !== USER_STATUS.ACTIVE || !user.emailVerifiedAt) {
      throw new ForbiddenException('La cuenta no está habilitada');
    }

    const authorization = await this.usersService.findAuthorizationByUserId(
      user.id,
    );

    return {
      ...this.toSafeUser(user),
      authVersion: user.authVersion,
      ...authorization,
    };
  }

  async login(user: {
    id: number;
    email: string;
    name: string | null;
    authVersion: number;
    role: string | null;
    permissions: string[];
  }) {
    const { authVersion, ...safeUser } = user;

    return {
      accessToken: await this.signAccessToken(user.id, user.email, authVersion),
      refreshToken: await this.refreshTokensService.issue(user.id),
      user: safeUser,
    };
  }

  async refresh(refreshToken: string) {
    const rotated = await this.refreshTokensService.rotate(refreshToken);
    const user = await this.usersService.findById(rotated.userId);

    if (!user) {
      await this.refreshTokensService.revokeAll(rotated.userId);
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (user.status !== USER_STATUS.ACTIVE || !user.emailVerifiedAt) {
      await this.refreshTokensService.revokeAll(user.id);
      throw new UnauthorizedException('La cuenta no está habilitada');
    }

    const authorization = await this.usersService.findAuthorizationByUserId(
      user.id,
    );
    const safeUser = {
      ...this.toSafeUser(user),
      ...authorization,
    };

    return {
      accessToken: await this.signAccessToken(
        user.id,
        user.email,
        user.authVersion,
      ),
      refreshToken: rotated.token,
      user: safeUser,
    };
  }

  async logout(refreshToken: string) {
    await this.refreshTokensService.revoke(refreshToken);

    return { message: 'Sesión cerrada correctamente' };
  }

  async logoutAll(userId: number) {
    const user = await this.usersService.incrementAuthVersion(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    await this.refreshTokensService.revokeAll(userId);

    return { message: 'Todas las sesiones fueron cerradas correctamente' };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findById(userId);

    if (!user || !(await argon2.verify(user.password, currentPassword))) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    if (await argon2.verify(user.password, newPassword)) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    const passwordHash = await argon2.hash(newPassword, PASSWORD_HASH_OPTIONS);
    const updated = await this.usersService.changePassword(
      userId,
      passwordHash,
    );

    if (!updated) {
      throw new UnauthorizedException();
    }

    await this.refreshTokensService.revokeAll(userId);

    return {
      message: 'Contraseña actualizada; todas las sesiones fueron cerradas',
    };
  }

  async forgotPassword(emailInput: string) {
    const email = this.normalizeEmail(emailInput);
    const user = await this.usersService.findByEmail(email);

    if (user) {
      const token = await this.passwordResetTokensService.issue(user.id);
      await this.passwordResetMailerService.send(user.email, token);
    }

    return {
      message:
        'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await argon2.hash(newPassword, PASSWORD_HASH_OPTIONS);
    const userId = await this.passwordResetTokensService.resetPassword(
      token,
      passwordHash,
    );

    await this.refreshTokensService.revokeAll(userId);

    return {
      message: 'Contraseña restablecida; inicia sesión nuevamente',
    };
  }

  async verifyEmail(token: string) {
    await this.emailVerificationTokensService.verify(token);

    return { message: 'Correo verificado; ya puedes iniciar sesión' };
  }

  async resendVerification(emailInput: string) {
    const email = this.normalizeEmail(emailInput);
    const user = await this.usersService.findByEmail(email);

    if (user?.status === USER_STATUS.PENDING_VERIFICATION) {
      const token = await this.emailVerificationTokensService.issue(user.id);
      await this.passwordResetMailerService.sendVerification(user.email, token);
    }

    return {
      message:
        'Si la cuenta necesita verificación, recibirás un nuevo enlace por correo',
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private signAccessToken(
    userId: number,
    email: string,
    authVersion: number,
  ): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, email, ver: authVersion });
  }

  private toSafeUser(user: {
    id: number;
    email: string;
    name: string | null;
    createdAt: unknown;
    updatedAt: unknown;
    status: string;
    emailVerifiedAt: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}
