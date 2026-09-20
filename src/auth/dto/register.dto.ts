import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input: unknown = value;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

function trimString({ value }: TransformFnParams): unknown {
  const input: unknown = value;

  return typeof input === 'string' ? input.trim() : input;
}

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  name?: string;
}
