import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input: unknown = value;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export class ResendVerificationDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(45)
  token!: string;
}
