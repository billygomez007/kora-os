import { BadRequestException, ForbiddenException } from '@nestjs/common';

export interface CorrectionDecisionAuthorizationContext {
  /** Whether the acting membership is the same one that requested this
   * correction. */
  isRequester: boolean;
  /** Whether the acting membership holds the `owner` role and is
   * ACTIVE. */
  isActiveOwner: boolean;
  /** Whether at least one OTHER active membership in the organization
   * holds `refunds.approve` (i.e. some independent approver genuinely
   * exists). */
  hasOtherEligibleApprover: boolean;
  /** The `overrideReason` field from the request body — only consulted
   * on the solo-owner-override path, where it becomes mandatory. */
  overrideReason: string | undefined;
}

export interface CorrectionDecisionAuthorizationResult {
  /** True when this approval/rejection is reached via the solo-owner
   * override rather than an independent approver — the caller writes a
   * separate, clearly labelled `correction.solo_owner_override` audit
   * event when this is true. */
  soloOwnerOverride: boolean;
}

/**
 * The separation-of-duties rule for approving or rejecting a
 * TransactionCorrection (docs task Phase 3: "The correction requester
 * cannot approve their own request"). Applied identically to both
 * approve and reject — rejecting your own request is what `cancel`
 * exists for, so a requester attempting either is always the same
 * conflict-of-interest question. The one escape hatch is a solo owner
 * with no other eligible approver in the organization at all, and only
 * with an explicit, non-empty override reason — the same "no independent
 * check exists, so require an audited override" shape
 * `assertConfirmAuthorized` already established for payment
 * confirmation.
 */
export function assertCorrectionDecisionAuthorized(
  context: CorrectionDecisionAuthorizationContext,
): CorrectionDecisionAuthorizationResult {
  if (!context.isRequester) {
    return { soloOwnerOverride: false };
  }

  if (context.isActiveOwner && !context.hasOtherEligibleApprover) {
    if (!context.overrideReason?.trim()) {
      throw new BadRequestException(
        'A reason is required to approve or reject your own correction request as a solo-owner override',
      );
    }
    return { soloOwnerOverride: true };
  }

  throw new ForbiddenException({
    code: 'CORRECTION_SELF_DECISION_FORBIDDEN',
    message: 'You cannot approve or reject a correction you requested yourself',
  });
}
