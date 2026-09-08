import { IsBoolean } from 'class-validator';

export class UpdateQrStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
