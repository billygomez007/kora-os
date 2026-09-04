import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertStartAuthorized, type StartAuthorizationContext } from './service-session-start-authorization.util.js';

function context(overrides: Partial<StartAuthorizationContext> = {}): StartAuthorizationContext {
  return {
    hasManage: false,
    hasPerform: false,
    hasStart: false,
    hasChangeProviderPermission: false,
    ownStaffProfileId: null,
    resolvedProviderStaffProfileId: 'provider-1',
    providerExplicitlyRequested: false,
    currentlyAssignedStaffProfileId: 'provider-1',
    ...overrides,
  };
}

describe('assertStartAuthorized', () => {
  it('throws when none of the three permissions are held', () => {
    expect(() => assertStartAuthorized(context())).toThrow(ForbiddenException);
  });

  describe('service_sessions.manage', () => {
    it('allows any provider, explicitly requested or not', () => {
      expect(() =>
        assertStartAuthorized(
          context({
            hasManage: true,
            resolvedProviderStaffProfileId: 'someone-else',
            providerExplicitlyRequested: true,
            currentlyAssignedStaffProfileId: 'provider-1',
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('service_sessions.perform', () => {
    it('allows starting the caller\'s own assigned work', () => {
      expect(() =>
        assertStartAuthorized(
          context({ hasPerform: true, ownStaffProfileId: 'provider-1', resolvedProviderStaffProfileId: 'provider-1' }),
        ),
      ).not.toThrow();
    });

    it('rejects starting a different provider\'s work', () => {
      expect(() =>
        assertStartAuthorized(
          context({ hasPerform: true, ownStaffProfileId: 'provider-1', resolvedProviderStaffProfileId: 'provider-2' }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('rejects when the caller holds no StaffProfile at all', () => {
      expect(() =>
        assertStartAuthorized(
          context({ hasPerform: true, ownStaffProfileId: null, resolvedProviderStaffProfileId: 'provider-1' }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('service_sessions.start', () => {
    it('allows starting the queue entry\'s already-assigned provider without an explicit request', () => {
      expect(() =>
        assertStartAuthorized(
          context({
            hasStart: true,
            providerExplicitlyRequested: false,
            resolvedProviderStaffProfileId: 'provider-1',
            currentlyAssignedStaffProfileId: 'provider-1',
          }),
        ),
      ).not.toThrow();
    });

    it('allows explicitly naming the same already-assigned provider', () => {
      expect(() =>
        assertStartAuthorized(
          context({
            hasStart: true,
            providerExplicitlyRequested: true,
            resolvedProviderStaffProfileId: 'provider-1',
            currentlyAssignedStaffProfileId: 'provider-1',
          }),
        ),
      ).not.toThrow();
    });

    it('rejects redirecting to a different provider without queue.manage', () => {
      expect(() =>
        assertStartAuthorized(
          context({
            hasStart: true,
            hasChangeProviderPermission: false,
            providerExplicitlyRequested: true,
            resolvedProviderStaffProfileId: 'provider-2',
            currentlyAssignedStaffProfileId: 'provider-1',
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('allows redirecting to a different provider with queue.manage', () => {
      expect(() =>
        assertStartAuthorized(
          context({
            hasStart: true,
            hasChangeProviderPermission: true,
            providerExplicitlyRequested: true,
            resolvedProviderStaffProfileId: 'provider-2',
            currentlyAssignedStaffProfileId: 'provider-1',
          }),
        ),
      ).not.toThrow();
    });

    it('rejects when there was no prior assignment and a provider is now being resolved from an explicit request', () => {
      // resolvedProviderStaffProfileId can only differ from
      // currentlyAssignedStaffProfileId (null) here because the caller
      // explicitly supplied one — a change from "no one" to "someone"
      // still counts as changing the provider.
      expect(() =>
        assertStartAuthorized(
          context({
            hasStart: true,
            hasChangeProviderPermission: false,
            providerExplicitlyRequested: true,
            resolvedProviderStaffProfileId: 'provider-1',
            currentlyAssignedStaffProfileId: null,
          }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  it('prioritizes manage over perform and start when a caller holds more than one', () => {
    expect(() =>
      assertStartAuthorized(
        context({
          hasManage: true,
          hasPerform: true,
          ownStaffProfileId: 'someone-else',
          resolvedProviderStaffProfileId: 'provider-1',
        }),
      ),
    ).not.toThrow();
  });
});
