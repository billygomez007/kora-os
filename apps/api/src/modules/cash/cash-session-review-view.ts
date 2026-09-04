import type { CashSessionReview } from '../../generated/prisma/client.js';

export interface CashSessionReviewView {
  id: string;
  organizationId: string;
  cashSessionId: string;
  outcome: string;
  reason: string;
  reviewedByMembershipId: string;
  reviewedAt: string;
}

export function toCashSessionReviewView(review: CashSessionReview): CashSessionReviewView {
  return {
    id: review.id,
    organizationId: review.organizationId,
    cashSessionId: review.cashSessionId,
    outcome: review.outcome,
    reason: review.reason,
    reviewedByMembershipId: review.reviewedByMembershipId,
    reviewedAt: review.reviewedAt.toISOString(),
  };
}
