import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListReceiptsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  customerRecordId?: string;

  /** `transactionId` is unique per Receipt — lets a client resolve
   * "what receipt was issued for this posted Transaction?" directly,
   * since no other lookup key connects the two (docs task Phase 11:
   * Transaction detail's "Receipt link"). */
  @IsOptional()
  @IsUUID()
  transactionId?: string;

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
