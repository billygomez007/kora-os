import { IsOptional, IsUUID } from 'class-validator';

/** Omitted when the queue entry already carries an assigned provider
 * (see QueueCommandsService.assign) — required otherwise. */
export class StartServiceSessionDto {
  @IsOptional()
  @IsUUID()
  staffProfileId?: string;
}
