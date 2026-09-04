import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BranchScheduleExceptionType } from '../../../generated/prisma/client.js';
import { IsLocalDate, IsLocalTime } from '../../../common/scheduling/local-time.util.js';

class ScheduleExceptionIntervalDto {
  @IsLocalTime()
  startLocalTime!: string;

  @IsLocalTime()
  endLocalTime!: string;
}

export class CreateBranchScheduleExceptionDto {
  @IsLocalDate()
  date!: string;

  @IsEnum(BranchScheduleExceptionType)
  type!: BranchScheduleExceptionType;

  /** Required (and only meaningful) when type is SPECIAL_HOURS — see the
   * DB-level branch_schedule_exceptions_intervals_shape CHECK constraint
   * this DTO mirrors. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScheduleExceptionIntervalDto)
  @ArrayMinSize(1)
  intervals?: ScheduleExceptionIntervalDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
