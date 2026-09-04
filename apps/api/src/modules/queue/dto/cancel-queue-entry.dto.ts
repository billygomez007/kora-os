import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelQueueEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
