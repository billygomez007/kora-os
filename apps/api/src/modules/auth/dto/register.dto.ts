import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // Length over composition rules (docs/SECURITY.md section 6): no forced
  // uppercase/digit/symbol, just a safe minimum length.
  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}
