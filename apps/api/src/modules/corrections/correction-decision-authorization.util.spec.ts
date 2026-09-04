import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertCorrectionDecisionAuthorized,
  type CorrectionDecisionAuthorizationContext,
} from './correction-decision-authorization.util.js';

function context(overrides: Partial<CorrectionDecisionAuthorizationContext> = {}): CorrectionDecisionAuthorizationContext {
  return {
    isRequester: false,
    isActiveOwner: false,
    hasOtherEligibleApprover: false,
    overrideReason: undefined,
    ...overrides,
  };
}

describe('assertCorrectionDecisionAuthorized', () => {
  it('allows a non-requester to decide', () => {
    const result = assertCorrectionDecisionAuthorized(context({ isRequester: false }));
    expect(result).toEqual({ soloOwnerOverride: false });
  });

  it('forbids a requester who is not a solo owner', () => {
    expect(() => assertCorrectionDecisionAuthorized(context({ isRequester: true }))).toThrow(ForbiddenException);
  });

  it('forbids a requester who is an owner but another eligible approver exists', () => {
    expect(() =>
      assertCorrectionDecisionAuthorized(context({ isRequester: true, isActiveOwner: true, hasOtherEligibleApprover: true })),
    ).toThrow(ForbiddenException);
  });

  it('allows the solo-owner override with a reason', () => {
    const result = assertCorrectionDecisionAuthorized(
      context({ isRequester: true, isActiveOwner: true, hasOtherEligibleApprover: false, overrideReason: 'Solo operator' }),
    );
    expect(result).toEqual({ soloOwnerOverride: true });
  });

  it('rejects the solo-owner override with no reason', () => {
    expect(() =>
      assertCorrectionDecisionAuthorized(context({ isRequester: true, isActiveOwner: true, hasOtherEligibleApprover: false })),
    ).toThrow(BadRequestException);
  });

  it('rejects the solo-owner override with a blank reason', () => {
    expect(() =>
      assertCorrectionDecisionAuthorized(
        context({ isRequester: true, isActiveOwner: true, hasOtherEligibleApprover: false, overrideReason: '   ' }),
      ),
    ).toThrow(BadRequestException);
  });
});
