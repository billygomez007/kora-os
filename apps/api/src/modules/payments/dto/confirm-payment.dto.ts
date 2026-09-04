import { IsOptional, IsString, MaxLength } from 'class-validator';

/** `reason` is optional for an ordinary provider confirmation, but
 * PaymentVerificationsService enforces it as mandatory for the
 * management-override path (an owner/manager confirming without
 * `payments.verify_own` authorization over this specific record — docs
 * task Phase 3: "must require an explicit reason and create a clearly
 * labelled management-override event"). */
export class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
