import type { Prisma } from '../../generated/prisma/client.js';
import { toCashSessionReviewView, type CashSessionReviewView } from './cash-session-review-view.js';

export const cashSessionViewInclude = {
  review: true,
} satisfies Prisma.CashSessionInclude;

type CashSessionWithRelations = Prisma.CashSessionGetPayload<{ include: typeof cashSessionViewInclude }>;

export interface CashSessionView {
  id: string;
  organizationId: string;
  branchId: string;
  registerId: string;
  currency: string;
  openedByMembershipId: string;
  openingFloatMinor: number;
  openedAt: string;
  closedAt: string | null;
  closedByMembershipId: string | null;
  expectedClosingCashMinor: number | null;
  countedCashMinor: number | null;
  varianceMinor: number | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  review: CashSessionReviewView | null;
}

/**
 * `expectedClosingCashMinor`/`countedCashMinor`/`varianceMinor` describe
 * physical drawer custody only — never revenue (docs task Phase 1). This
 * view never carries a "revenue" or "sales" field of its own.
 */
export function toCashSessionView(session: CashSessionWithRelations): CashSessionView {
  return {
    id: session.id,
    organizationId: session.organizationId,
    branchId: session.branchId,
    registerId: session.registerId,
    currency: session.currency,
    openedByMembershipId: session.openedByMembershipId,
    openingFloatMinor: session.openingFloatMinor,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    closedByMembershipId: session.closedByMembershipId,
    expectedClosingCashMinor: session.expectedClosingCashMinor,
    countedCashMinor: session.countedCashMinor,
    varianceMinor: session.varianceMinor,
    status: session.status,
    version: session.version,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    review: session.review ? toCashSessionReviewView(session.review) : null,
  };
}
