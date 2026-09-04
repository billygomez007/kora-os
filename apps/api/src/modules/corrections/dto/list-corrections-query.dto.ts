import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TransactionCorrectionStatus, TransactionCorrectionType } from '../../../generated/prisma/client.js';

export class ListCorrectionsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  originalTransactionId?: string;

  @IsOptional()
  @IsEnum(TransactionCorrectionType)
  correctionType?: TransactionCorrectionType;

  @IsOptional()
  @IsEnum(TransactionCorrectionStatus)
  status?: TransactionCorrectionStatus;

  @IsOptional()
  @IsUUID()
  requestedByMembershipId?: string;

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
