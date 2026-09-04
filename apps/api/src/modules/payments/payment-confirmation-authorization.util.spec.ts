import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertConfirmAuthorized, type ConfirmAuthorizationContext } from './payment-confirmation-authorization.util.js';

function context(overrides: Partial<ConfirmAuthorizationContext> = {}): ConfirmAuthorizationContext {
  return {
    hasVerifyOwn: false,
    hasResolve: false,
    isAssignedProvider: false,
    isSelfRecorded: false,
    overrideReason: undefined,
    ...overrides,
  };
}

describe('assertConfirmAuthorized', () => {
  it('allows the assigned provider to confirm a payment they did not record', () => {
    const result = assertConfirmAuthorized(context({ hasVerifyOwn: true, isAssignedProvider: true, isSelfRecorded: false }));
    expect(result).toEqual({ isManagementOverride: false });
  });

  it('forbids a recorder who is also the assigned provider from self-confirming, with no resolve permission available', () => {
    expect(() =>
      assertConfirmAuthorized(context({ hasVerifyOwn: true, isAssignedProvider: true, isSelfRecorded: true })),
    ).toThrow(ForbiddenException);
  });

  it('forbids a provider from confirming a payment assigned to someone else, with no resolve permission available', () => {
    expect(() => assertConfirmAuthorized(context({ hasVerifyOwn: true, isAssignedProvider: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a management override for the solo owner/provider self-confirmation deadlock, given a reason', () => {
    const result = assertConfirmAuthorized(
      context({
        hasVerifyOwn: true,
        hasResolve: true,
        isAssignedProvider: true,
        isSelfRecorded: true,
        overrideReason: 'Solo operator, no other staff available',
      }),
    );
    expect(result).toEqual({ isManagementOverride: true });
  });

  it('allows a management override for a manager confirming a payment they are not the assigned provider for, given a reason', () => {
    const result = assertConfirmAuthorized(
      context({ hasResolve: true, isAssignedProvider: false, overrideReason: 'Provider unavailable, confirmed against till receipt' }),
    );
    expect(result).toEqual({ isManagementOverride: true });
  });

  it('rejects a management override with no reason', () => {
    expect(() => assertConfirmAuthorized(context({ hasResolve: true, isAssignedProvider: false, overrideReason: undefined }))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a management override with a blank reason', () => {
    expect(() => assertConfirmAuthorized(context({ hasResolve: true, isAssignedProvider: false, overrideReason: '   ' }))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a caller with neither permission', () => {
    expect(() => assertConfirmAuthorized(context())).toThrow(ForbiddenException);
  });

  it('prefers the management-override path over self-confirmation-forbidden when both hasResolve and the self-confirm deadlock apply', () => {
    // hasResolve is checked before the self-confirmation-forbidden branch,
    // so a solo owner/provider who also holds payments.resolve never hits
    // the hard failure — that is the whole point of the escape hatch.
    const result = assertConfirmAuthorized(
      context({ hasVerifyOwn: true, hasResolve: true, isAssignedProvider: true, isSelfRecorded: true, overrideReason: 'reason' }),
    );
    expect(result.isManagementOverride).toBe(true);
  });
});
