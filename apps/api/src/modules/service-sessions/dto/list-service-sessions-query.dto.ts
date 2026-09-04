import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ServiceSessionStatus } from '../../../generated/prisma/client.js';

export class ListServiceSessionsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(ServiceSessionStatus)
  status?: ServiceSessionStatus;

  @IsOptional()
  @IsUUID()
  assignedStaffProfileId?: string;

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
