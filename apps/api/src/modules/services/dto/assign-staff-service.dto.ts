import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AssignStaffServiceDto {
  @IsUUID()
  staffProfileId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationOverrideMinutes?: number;
}
