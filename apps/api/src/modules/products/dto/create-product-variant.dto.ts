import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateProductVariantDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  costPriceMinor?: number;

  @IsInt()
  @Min(0)
  sellingPriceMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
