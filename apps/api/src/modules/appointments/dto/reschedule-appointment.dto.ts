import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class RescheduleAppointmentDto {
  @IsISO8601()
  startAt!: string;

  /** Omitted keeps the currently assigned provider. */
  @IsOptional()
  @IsUUID()
  staffProfileId?: string;
}
