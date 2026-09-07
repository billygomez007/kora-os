import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CheckoutProductItemDto } from './checkout-product-item.dto.js';

/** Body for creating a checkout from a completed service session
 * (existing behavior, unchanged). `productItems` is the mixed-checkout
 * extension — retail products rung up alongside the session's own
 * service lines, e.g. a haircut plus a bottle of beard oil — and is
 * entirely optional so a plain service-only checkout keeps working with
 * no request body at all. */
export class CreateServiceCheckoutDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutProductItemDto)
  productItems?: CheckoutProductItemDto[];
}
