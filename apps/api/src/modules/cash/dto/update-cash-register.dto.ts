import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCashRegisterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
}
