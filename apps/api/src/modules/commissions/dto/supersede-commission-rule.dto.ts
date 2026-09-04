import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Length, Max, Min } from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';
import { CommissionCalculationBasis, CommissionRuleType } from '../../../generated/prisma/client.js';

const MAX_BASIS_POINTS = 10_000;

/** No `branchId`/`staffProfileId`/`serviceId` fields — a supersession
 * always keeps the exact scope of the rule it replaces (CommissionRules
 * Service copies those from the existing row); only the commission
 * terms themselves change. */
export class SupersedeCommissionRuleDto {
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

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
