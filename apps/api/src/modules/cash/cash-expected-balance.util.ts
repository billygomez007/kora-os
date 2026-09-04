import { cashLedgerEntryDirection } from './cash-ledger-direction.util.js';
import type { CashLedgerEntryType } from '../../generated/prisma/client.js';

export interface CashLedgerEntrySnapshot {
  type: CashLedgerEntryType;
  amountMinor: number;
}

/**
 * Expected drawer cash — a physical-custody calculation only, never
 * revenue (docs task Phase 1) — computed exclusively from a session's
 * own immutable CashLedgerEntry rows, including the OPENING_FLOAT entry
 * written once when the session opens (so the opening float is just the
 * first entry in the sum, not a separately-tracked total that could ever
 * drift from what the ledger itself says):
 *
 *   opening float + payments received + manual cash in
 *   - manual cash out - safe drops - executed cash refunds
 *
 * Pure and order-independent — CashSessionService.close calls this
 * against every entry for the session, read inside the same row lock
 * that blocks any further entry from being added underneath it.
 */
export function calculateExpectedClosingCashMinor(entries: readonly CashLedgerEntrySnapshot[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountMinor * cashLedgerEntryDirection(entry.type), 0);
}
