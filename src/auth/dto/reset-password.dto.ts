import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(40)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
