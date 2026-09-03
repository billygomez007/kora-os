import { Injectable } from '@nestjs/common';
import {
  SubscriptionAccessMode,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';

/**
 * Effective access mode per subscription status (docs/ARCHITECTURE.md
 * section 9). SUSPENDED is treated the same as READ_ONLY: operational data
 * stays viewable, but new commercial activity is blocked.
 */
const ACCESS_MODE_BY_STATUS: Record<
  SubscriptionStatus,
  SubscriptionAccessMode
> = {
  [SubscriptionStatus.TRIALING]: SubscriptionAccessMode.FULL,
  [SubscriptionStatus.ACTIVE]: SubscriptionAccessMode.FULL,
  [SubscriptionStatus.GRACE_PERIOD]: SubscriptionAccessMode.FULL,
  [SubscriptionStatus.PAST_DUE]: SubscriptionAccessMode.LIMITED,
  [SubscriptionStatus.READ_ONLY]: SubscriptionAccessMode.READ_ONLY,
  [SubscriptionStatus.SUSPENDED]: SubscriptionAccessMode.READ_ONLY,
  [SubscriptionStatus.CANCELED]: SubscriptionAccessMode.BLOCKED,
  [SubscriptionStatus.EXPIRED]: SubscriptionAccessMode.BLOCKED,
};

/**
 * Mobile clients never set their own access mode (docs/SECURITY.md section
 * 10) — it is always derived here, server-side, from subscription status.
 */
@Injectable()
export class SubscriptionAccessService {
  resolveAccessMode(status: SubscriptionStatus): SubscriptionAccessMode {
    return ACCESS_MODE_BY_STATUS[status];
  }
}
