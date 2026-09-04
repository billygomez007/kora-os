import { Type } from 'class-transformer';
import { ArrayMaxSize, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { IsLocalDate, IsLocalTime } from '../../../common/scheduling/local-time.util.js';

class StaffAvailabilityIntervalDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsLocalTime()
  startLocalTime!: string;

  @IsLocalTime()
  endLocalTime!: string;

  @IsOptional()
  @IsLocalDate()
  effectiveFrom?: string;

  @IsOptional()
  @IsLocalDate()
  effectiveUntil?: string;
}

/** Full replace-all semantics for one staff member's recurring weekly
 * availability at one branch (docs task Phase 14), mirroring
 * ReplaceBusinessHoursDto. */
export class ReplaceStaffAvailabilityRulesDto {
  @ValidateNested({ each: true })
  @Type(() => StaffAvailabilityIntervalDto)
  @ArrayMaxSize(100)
  intervals!: StaffAvailabilityIntervalDto[];
}
