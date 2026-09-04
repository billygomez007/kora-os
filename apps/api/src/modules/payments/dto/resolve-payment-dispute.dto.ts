import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentDisputeResolution } from '../../../generated/prisma/client.js';

export class ResolvePaymentDisputeDto {
  @IsEnum(PaymentDisputeResolution)
  resolution!: PaymentDisputeResolution;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolutionNote?: string;
}
