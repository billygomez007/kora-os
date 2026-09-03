import {
  SubscriptionAccessMode,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import { SubscriptionAccessService } from './subscription-access.service.js';

describe('SubscriptionAccessService', () => {
  const service = new SubscriptionAccessService();

  it.each<[SubscriptionStatus, SubscriptionAccessMode]>([
    [SubscriptionStatus.TRIALING, SubscriptionAccessMode.FULL],
    [SubscriptionStatus.ACTIVE, SubscriptionAccessMode.FULL],
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionAccessMode.FULL],
    [SubscriptionStatus.PAST_DUE, SubscriptionAccessMode.LIMITED],
    [SubscriptionStatus.READ_ONLY, SubscriptionAccessMode.READ_ONLY],
    [SubscriptionStatus.SUSPENDED, SubscriptionAccessMode.READ_ONLY],
    [SubscriptionStatus.CANCELED, SubscriptionAccessMode.BLOCKED],
    [SubscriptionStatus.EXPIRED, SubscriptionAccessMode.BLOCKED],
  ])('resolves %s to %s', (status, expectedMode) => {
    expect(service.resolveAccessMode(status)).toBe(expectedMode);
  });
});
