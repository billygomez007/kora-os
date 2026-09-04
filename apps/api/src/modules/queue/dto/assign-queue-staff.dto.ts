import { IsUUID } from 'class-validator';

export class AssignQueueStaffDto {
  @IsUUID()
  staffProfileId!: string;
}
