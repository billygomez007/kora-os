import type { CashLedgerEntry } from '../../generated/prisma/client.js';
import { cashLedgerEntryDirection } from './cash-ledger-direction.util.js';

export interface CashLedgerEntryView {
  id: string;
  organizationId: string;
  branchId: string;
  registerId: string;
  cashSessionId: string;
  currency: string;
  type: string;
  amountMinor: number;
  /** Signed convenience projection of `amountMinor` — `type` remains the
   * single source of truth for direction (cashLedgerEntryDirection). */
  signedAmountMinor: number;
  paymentRecordId: string | null;
  correctiveTransactionId: string | null;
  reason: string | null;
  actorMembershipId: string;
  occurredAt: string;
}

export function toCashLedgerEntryView(entry: CashLedgerEntry): CashLedgerEntryView {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    registerId: entry.registerId,
    cashSessionId: entry.cashSessionId,
    currency: entry.currency,
    type: entry.type,
    amountMinor: entry.amountMinor,
    signedAmountMinor: entry.amountMinor * cashLedgerEntryDirection(entry.type),
    paymentRecordId: entry.paymentRecordId,
    correctiveTransactionId: entry.correctiveTransactionId,
    reason: entry.reason,
    actorMembershipId: entry.actorMembershipId,
    occurredAt: entry.occurredAt.toISOString(),
  };
}
