import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DisputePaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
