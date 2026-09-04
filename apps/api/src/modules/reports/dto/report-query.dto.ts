import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Shared query shape across every report endpoint. `cursor`/`limit`
 * are only meaningful for the endpoints whose result is a detail list
 * (staff-performance, services, payment-methods, commissions) — overview
 * and revenue ignore them, already bounded by the 366-day range cap and
 * the (day x currency) grouping. */
export class ReportQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Required when `branchId` is omitted (an organization-wide report
   * spanning potentially many branch timezones) — see
   * resolveReportTimeZone. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

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
