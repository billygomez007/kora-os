export const ANNUAL_DISCOUNT_PERCENT = 10;

export const PUBLIC_PRICING = {
  starter: { monthlyAmountMinor: 14900, annualAmountMinor: 160920 },
  business: { monthlyAmountMinor: 29900, annualAmountMinor: 322920 },
  pro: { monthlyAmountMinor: 59900, annualAmountMinor: 646920 },
  enterprise: { monthlyAmountMinor: null, annualAmountMinor: null },
} as const;

export type PublicPricingPlan = keyof typeof PUBLIC_PRICING;

export function formatGhsMinor(amountMinor: number | null): string | null {
  if (amountMinor === null) return null;
  return `GHS ${(amountMinor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function annualAmountMinorFromMonthly(monthlyAmountMinor: number): number {
  return (monthlyAmountMinor * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100;
}
