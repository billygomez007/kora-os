import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
