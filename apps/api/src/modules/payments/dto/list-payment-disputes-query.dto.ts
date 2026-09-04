import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaymentDisputeStatus } from '../../../generated/prisma/client.js';

export class ListPaymentDisputesQueryDto {
  @IsOptional()
  @IsEnum(PaymentDisputeStatus)
  status?: PaymentDisputeStatus;

  @IsOptional()
  @Type(() => String)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
