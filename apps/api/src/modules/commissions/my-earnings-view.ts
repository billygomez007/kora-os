import type { Prisma } from '../../generated/prisma/client.js';
import {
  toCommissionAccrualView,
  type CommissionAccrualView,
} from './commission-accrual-view.js';

export const myEarningsInclude = {
  transaction: { select: { reference: true, postedAt: true } },
  transactionLineItem: {
    select: { serviceId: true, serviceNameSnapshot: true },
  },
} satisfies Prisma.CommissionAccrualInclude;

type CommissionAccrualWithContext = Prisma.CommissionAccrualGetPayload<{
  include: typeof myEarningsInclude;
}>;

export interface MyEarningsLineView extends CommissionAccrualView {
  transactionReference: string;
  transactionPostedAt: string;
  serviceId: string;
  serviceName: string;
}

/** The caller's own accrued commission, enriched with just enough
 * transaction/service context to be useful on an earnings screen —
 * never anything beyond what this same staff member could already see
 * about their own assigned work (docs task Phase 2/4: "associated safe
 * transaction and service references"). */
export function toMyEarningsLineView(
  accrual: CommissionAccrualWithContext,
): MyEarningsLineView {
  return {
    ...toCommissionAccrualView(accrual),
    transactionReference: accrual.transaction.reference,
    transactionPostedAt: accrual.transaction.postedAt.toISOString(),
    serviceId: accrual.transactionLineItem.serviceId!,
    serviceName: accrual.transactionLineItem.serviceNameSnapshot!,
  };
}
