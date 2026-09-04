import { IsOptional, IsString, IsUUID } from 'class-validator';
import { IsLocalDate } from '../../../common/scheduling/local-time.util.js';

/** Query params arrive as strings; `serviceIds` is a comma-separated list
 * of UUIDs (order matters — it is the sequential service order). Either
 * `date` (single day) or both `fromDate`/`toDate` (a bounded range, see
 * MAX_AVAILABILITY_QUERY_DAYS) must be supplied — validated in the
 * service layer, where the two shapes are normalized into one range. */
export class QueryAvailabilityDto {
  @IsString()
  serviceIds!: string;

  @IsOptional()
  @IsUUID()
  staffProfileId?: string;

  @IsOptional()
  @IsLocalDate()
  date?: string;

  @IsOptional()
  @IsLocalDate()
  fromDate?: string;

  @IsOptional()
  @IsLocalDate()
  toDate?: string;
}
