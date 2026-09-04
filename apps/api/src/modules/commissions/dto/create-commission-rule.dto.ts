import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Length, Max, Min } from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';
import { CommissionCalculationBasis, CommissionRuleType } from '../../../generated/prisma/client.js';

const MAX_BASIS_POINTS = 10_000;

/**
 * Cross-field validation (rateBasisPoints required iff PERCENTAGE;
 * fixedAmountMinor/fixedCurrency required iff FIXED) happens in
 * CommissionRulesService, not here — matching how RecordPaymentDto's
 * CASH-only tenderedAmountMinor rule is enforced in PaymentsService
 * rather than via decorators.
 */
export class CreateCommissionRuleDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  staffProfileId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsEnum(CommissionRuleType)
  type!: CommissionRuleType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_BASIS_POINTS)
  rateBasisPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MINOR_AMOUNT)
  fixedAmountMinor?: number;

  @IsOptional()
  @Length(3, 3)
  fixedCurrency?: string;

  @IsOptional()
  @IsEnum(CommissionCalculationBasis)
  basis?: CommissionCalculationBasis;

  /** Defaults to "now" in the service when omitted — allows scheduling a
   * future rule change, but never a past-dated one (see the service). */
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
