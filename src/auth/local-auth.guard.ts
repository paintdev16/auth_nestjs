import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request } from 'express';

import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const body: unknown = request.body;

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Credenciales inválidas');
    }

    const credentials = plainToInstance(LoginDto, body);
    const validationErrors = validateSync(credentials, {
      whitelist: true,
    });

    if (validationErrors.length > 0) {
      throw new BadRequestException('Credenciales inválidas');
    }

    return super.canActivate(context);
  }
}
