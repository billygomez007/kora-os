import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCashRegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code must be a safe alphanumeric code' })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
