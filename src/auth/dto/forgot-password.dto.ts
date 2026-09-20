import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail } from 'class-validator';

function normalizeEmail({ value }: TransformFnParams): unknown {
  const input: unknown = value;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export class ForgotPasswordDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;
}
