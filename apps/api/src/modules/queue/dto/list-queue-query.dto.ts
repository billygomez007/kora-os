import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IsLocalDate } from '../../../common/scheduling/local-time.util.js';
import { QueueEntryStatus } from '../../../generated/prisma/client.js';

export class ListQueueQueryDto {
  /** Defaults to today's branch-local business date when omitted. */
  @IsOptional()
  @IsLocalDate()
  businessDate?: string;

  @IsOptional()
  @IsEnum(QueueEntryStatus)
  status?: QueueEntryStatus;

  @IsOptional()
  @IsUUID()
  assignedStaffProfileId?: string;
}
