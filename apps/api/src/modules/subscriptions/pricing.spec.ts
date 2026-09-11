import { BillingInterval } from '../../generated/prisma/client.js';
import {
  annualAmountMinorFromMonthly,
  intervalForPublicPlanPrice,
  PUBLIC_PLAN_PRICING,
} from './pricing.js';

describe('approved public pricing', () => {
  it.each([
    ['starter', 14900, 160920],
    ['business', 29900, 322920],
    ['pro', 59900, 646920],
  ] as const)('%s uses the approved minor-unit prices', (code, monthly, annual) => {
    expect(PUBLIC_PLAN_PRICING[code]).toEqual({
      monthlyAmountMinor: monthly,
      annualAmountMinor: annual,
    });
    expect(annualAmountMinorFromMonthly(monthly)).toBe(annual);
  });

  it('keeps Enterprise custom-priced without a fabricated amount', () => {
    expect(PUBLIC_PLAN_PRICING.enterprise).toEqual({
      monthlyAmountMinor: null,
      annualAmountMinor: null,
    });
  });

  it('maps database billing intervals to display intervals', () => {
    expect(intervalForPublicPlanPrice(BillingInterval.MONTH)).toBe('monthly');
    expect(intervalForPublicPlanPrice(BillingInterval.YEAR)).toBe('annual');
  });
});
