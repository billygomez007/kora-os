import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MaxLength,
} from 'class-validator';
import { ServicePricingType } from '../../../generated/prisma/client.js';

export class CreateServiceDto {
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Positive whole minutes only (docs task Phase 11). */
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  /** Integer minor units — never a float (docs task Phase 11). */
  @IsInt()
  @Min(0)
  priceMinor!: number;

  /** ISO 4217 currency code. Format-validated only; Kora does not
   * restrict the platform to a single country's currency (docs task
   * Phase 11: "initially supporting GHS without hard-coding the entire
   * platform to Ghana"). */
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter uppercase ISO 4217 code' })
  currency!: string;

  @IsOptional()
  @IsEnum(ServicePricingType)
  pricingType?: ServicePricingType;

  @IsOptional()
  @IsBoolean()
  isBookableByCustomer?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
