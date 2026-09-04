import {
  ArrayMaxSize,
  ArrayMinSize,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Customer booking command (docs task Phase 19). The server, not the
 * client, determines organization, customer identity, effective prices,
 * effective durations, eligible staff, end time, buffers, subscription
 * eligibility, and final availability — this DTO carries only what the
 * customer actually chose. */
export class CreateAppointmentDto {
  @IsString()
  @MaxLength(80)
  businessSlug!: string;

  @IsUUID()
  branchId!: string;

  /** Ordered — sequential service order for this appointment. */
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  /** Omitted means "any available provider" (docs task Phase 19). */
  @IsOptional()
  @IsUUID()
  staffProfileId?: string;

  /** The UTC instant the customer selected from an (advisory) prior
   * availability query. */
  @IsISO8601()
  startAt!: string;

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;
}
