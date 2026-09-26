import {
  ArrayUnique,
  IsArray,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @Matches(/^[A-Za-z][A-Za-z0-9_-]*$/)
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/, { each: true })
  permissions?: string[];
}
