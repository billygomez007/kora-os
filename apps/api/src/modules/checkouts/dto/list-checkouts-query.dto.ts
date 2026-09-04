import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CheckoutStatus } from '../../../generated/prisma/client.js';

export class ListCheckoutsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(CheckoutStatus)
  status?: CheckoutStatus;

  @IsOptional()
  @IsUUID()
  assignedStaffProfileId?: string;

  @IsOptional()
  @IsUUID()
  customerRecordId?: string;

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
