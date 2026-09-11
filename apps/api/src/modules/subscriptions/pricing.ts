import { BillingInterval } from '../../generated/prisma/client.js';

export const ANNUAL_DISCOUNT_PERCENT = 10;

export const PUBLIC_PLAN_CODES = [
  'starter',
  'business',
  'pro',
  'enterprise',
] as const;

export type PublicPlanCode = (typeof PUBLIC_PLAN_CODES)[number];

export type PublicPlanPricing = {
  monthlyAmountMinor: number | null;
  annualAmountMinor: number | null;
};

/**
 * Approved Kora public pricing in minor GHS units. Enterprise is intentionally
 * null because it is custom-priced; it must never render as a fabricated zero.
 */
export const PUBLIC_PLAN_PRICING: Record<PublicPlanCode, PublicPlanPricing> = {
  starter: { monthlyAmountMinor: 14900, annualAmountMinor: 160920 },
  business: { monthlyAmountMinor: 29900, annualAmountMinor: 322920 },
  pro: { monthlyAmountMinor: 59900, annualAmountMinor: 646920 },
  enterprise: { monthlyAmountMinor: null, annualAmountMinor: null },
};

export function annualAmountMinorFromMonthly(monthlyAmountMinor: number): number {
  if (!Number.isInteger(monthlyAmountMinor) || monthlyAmountMinor < 0) {
    throw new Error('Monthly amount must be a non-negative integer in minor units');
  }

  const annual = monthlyAmountMinor * 12 * (100 - ANNUAL_DISCOUNT_PERCENT);
  if (annual % 100 !== 0) {
    throw new Error('Annual amount does not resolve to an exact minor-unit value');
  }

  return annual / 100;
}

export function intervalForPublicPlanPrice(
  interval: BillingInterval,
): 'monthly' | 'annual' {
  return interval === BillingInterval.YEAR ? 'annual' : 'monthly';
}
