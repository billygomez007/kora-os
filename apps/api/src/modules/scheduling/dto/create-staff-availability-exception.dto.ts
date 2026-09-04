import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StaffAvailabilityExceptionType } from '../../../generated/prisma/client.js';
import { IsLocalDate, IsLocalTime } from '../../../common/scheduling/local-time.util.js';

export class CreateStaffAvailabilityExceptionDto {
  @IsLocalDate()
  date!: string;

  @IsEnum(StaffAvailabilityExceptionType)
  type!: StaffAvailabilityExceptionType;

  @IsOptional()
  @IsBoolean()
  isFullDay?: boolean;

  @IsOptional()
  @IsLocalTime()
  startLocalTime?: string;

  @IsOptional()
  @IsLocalTime()
  endLocalTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
