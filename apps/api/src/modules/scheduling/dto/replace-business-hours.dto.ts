import { Type } from 'class-transformer';
import { ArrayMaxSize, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { IsLocalTime } from '../../../common/scheduling/local-time.util.js';

class BusinessHoursIntervalDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsLocalTime()
  startLocalTime!: string;

  @IsLocalTime()
  endLocalTime!: string;
}

/** Full replace-all semantics (docs task Phase 13): the client sends the
 * complete weekly set and the server replaces every existing row
 * atomically — see BranchBusinessHoursService.replace. */
export class ReplaceBusinessHoursDto {
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursIntervalDto)
  @ArrayMaxSize(100)
  intervals!: BusinessHoursIntervalDto[];
}
