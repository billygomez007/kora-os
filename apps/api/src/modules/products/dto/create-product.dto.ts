import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsUUID()
  productCategoryId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter uppercase ISO 4217 code',
  })
  currency!: string;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisibleOnMarketplace?: boolean;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantName?: string;

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
}
