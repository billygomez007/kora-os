import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
