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

  /** `serviceSessionId` is unique per Checkout — this lets a client
   * resolve "does a checkout already exist for this completed
   * session?" without guessing, since no other lookup key connects the
   * two resources (docs task Phase 7: "retrieve and display the
   * authoritative existing checkout instead of creating a local
   * duplicate"). */
  @IsOptional()
  @IsUUID()
  serviceSessionId?: string;

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
