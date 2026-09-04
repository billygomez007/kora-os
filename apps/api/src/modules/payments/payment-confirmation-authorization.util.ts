import { BadRequestException, ForbiddenException } from '@nestjs/common';

export interface ConfirmAuthorizationContext {
  /** `payments.verify_own`. */
  hasVerifyOwn: boolean;
  /** `payments.resolve` — the owner/manager escape hatch. */
  hasResolve: boolean;
  /** Whether the caller's own StaffProfile is the payment's
   * `confirmationRequiredByStaffProfileId`. */
  isAssignedProvider: boolean;
  /** Whether the caller is also the membership that recorded this
   * payment. */
  isSelfRecorded: boolean;
  /** The `reason` field from the request body — only consulted on the
   * management-override path, where it becomes mandatory. */
  overrideReason: string | undefined;
}

export interface ConfirmAuthorizationResult {
  /** True when this confirmation is reached via `payments.resolve`
   * rather than the caller being the assigned provider confirming their
   * own work — the caller (PaymentVerificationsService) uses this to
   * additionally write a `payment.management_override` audit event. */
  isManagementOverride: boolean;
}

/**
 * The fine-grained authorization rule for confirming a PaymentRecord
 * (docs task Phase 3). `@RequireAnyPermission('payments.verify_own',
 * 'payments.resolve')` at the route is only the coarse "holds at least
 * one of these" gate — this function is the actual rule once past it:
 *
 * - The assigned provider, using `payments.verify_own`, confirms their
 *   own work — *unless* they also recorded the payment themselves, which
 *   is always forbidden ("A recorder who is also the assigned provider
 *   cannot use payments.verify_own to self-confirm their own record").
 * - Anyone else holding `payments.resolve` (not the assigned provider,
 *   or the assigned provider blocked by the self-confirmation rule
 *   above — the "solo owner/provider" case this rule exists for) may
 *   still confirm the record as a management override, but only with an
 *   explicit, non-empty reason.
 * - A caller with `payments.verify_own` but who is not the assigned
 *   provider, and with no `payments.resolve` to fall back on, is
 *   rejected outright — a provider must never confirm or dispute
 *   another provider's payment.
 *
 * Pure and side-effect-free apart from throwing — every input is
 * resolved by the caller from the database first, never trusted from a
 * token or request body directly.
 */
export function assertConfirmAuthorized(context: ConfirmAuthorizationContext): ConfirmAuthorizationResult {
  if (context.hasVerifyOwn && context.isAssignedProvider && !context.isSelfRecorded) {
    return { isManagementOverride: false };
  }

  if (context.hasResolve) {
    if (!context.overrideReason?.trim()) {
      throw new BadRequestException(
        'A reason is required to confirm this payment as a management override',
      );
    }
    return { isManagementOverride: true };
  }

  if (context.hasVerifyOwn && context.isAssignedProvider && context.isSelfRecorded) {
    throw new ForbiddenException({
      code: 'PAYMENT_SELF_CONFIRMATION_FORBIDDEN',
      message: 'You cannot confirm a payment you recorded yourself for your own assigned work',
    });
  }

  throw new ForbiddenException({
    code: 'PAYMENT_CONFIRMATION_FORBIDDEN',
    message: 'You can only confirm your own assigned payments',
  });
}
