import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CheckoutProductItemDto } from './checkout-product-item.dto.js';

/** Product-only checkout — no ServiceSession exists to anchor it, so
 * `branchId` and (when the caller has no StaffProfile of their own)
 * `operatorStaffProfileId` are supplied directly instead of inherited. */
export class CreateProductCheckoutDto {
  @IsUUID()
  branchId!: string;

  /** Omitted for a walk-in sale with no CustomerRecord. */
  @IsOptional()
  @IsUUID()
  customerRecordId?: string;

  /** Defaults to the caller's own StaffProfile when omitted; required
   * only when the caller (e.g. a pure owner/manager membership) has
   * none of their own. */
  @IsOptional()
  @IsUUID()
  operatorStaffProfileId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutProductItemDto)
  items!: CheckoutProductItemDto[];
}
