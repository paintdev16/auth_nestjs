import { Matches, MaxLength, MinLength } from 'class-validator';

export class UpdatePermissionDto {
  @Matches(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/)
  @MinLength(3)
  @MaxLength(100)
  name!: string;
}
