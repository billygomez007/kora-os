import { IsInt, Min } from 'class-validator';

export class UpdateReorderLevelDto {
  @IsInt()
  @Min(0)
  reorderLevel!: number;
}
