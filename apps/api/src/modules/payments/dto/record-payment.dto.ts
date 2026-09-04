import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';
import { PaymentMethod } from '../../../generated/prisma/client.js';

/** Recording categories only — CASH, MOBILE_MONEY, CARD, BANK_TRANSFER,
 * OTHER. No payment-gateway integration exists behind any of these
 * (docs task Phase 2: never Paystack, Hubtel, Flutterwave, Stripe, a
 * bank, or a card processor). */
export class RecordPaymentDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsInt()
  @Min(1)
  @Max(MAX_MINOR_AMOUNT)
  appliedAmountMinor!: number;

  /** Only meaningful for CASH — the amount physically handed over,
   * which may exceed `appliedAmountMinor` (change is derived, never
   * itself stored). Rejected for any other method (PaymentsService). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR_AMOUNT)
  tenderedAmountMinor?: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  /** A safe reference *code* only — never a card/account number, PIN,
   * or other credential (docs task Phase 2). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'externalReference must be a safe alphanumeric code' })
  externalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Only meaningful for CASH — associates this claim with the
   * cashier's open drawer session so exactly one PAYMENT_RECEIVED
   * CashLedgerEntry is written atomically alongside it. Required
   * when the branch's BranchCashPolicy is REQUIRED; rejected outright
   * for any non-CASH method (PaymentsService). */
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;
}
