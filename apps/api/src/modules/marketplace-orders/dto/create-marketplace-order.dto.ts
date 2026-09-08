import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MarketplaceFulfillmentMethod } from '../../../generated/prisma/enums.js';

export class CreateMarketplaceOrderItemDto {
  @IsUUID()
  productVariantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class CreateMarketplaceOrderDto {
  @IsString()
  @MaxLength(160)
  businessSlug!: string;

  @IsUUID()
  branchId!: string;

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateMarketplaceOrderItemDto)
  items!: CreateMarketplaceOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceQrCode?: string;

  @IsOptional()
  @IsEnum(MarketplaceFulfillmentMethod)
  fulfillmentMethod?: MarketplaceFulfillmentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
