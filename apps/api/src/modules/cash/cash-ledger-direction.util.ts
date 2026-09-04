import { CashLedgerEntryType } from '../../generated/prisma/client.js';

/**
 * `CashLedgerEntry.amountMinor` is always stored as a positive magnitude
 * — `type` alone determines whether it adds to or removes from the
 * drawer, the same "type determines sign" convention `CheckoutAdjustment`
 * already established. Pure and total over every entry type, so a
 * newly-added type can never silently fall through to an implicit
 * direction.
 */
export function cashLedgerEntryDirection(type: CashLedgerEntryType): 1 | -1 {
  switch (type) {
    case CashLedgerEntryType.OPENING_FLOAT:
    case CashLedgerEntryType.PAYMENT_RECEIVED:
    case CashLedgerEntryType.CASH_IN:
      return 1;
    case CashLedgerEntryType.CASH_OUT:
    case CashLedgerEntryType.SAFE_DROP:
    case CashLedgerEntryType.REFUND_PAID:
      return -1;
  }
}
