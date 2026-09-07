import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  quantityDelta!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
