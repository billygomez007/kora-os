const SEQUENCE_PADDING = 5;

/**
 * `{branchCode}-{year}-{sequence}`, e.g. `MAIN-2026-00001` — built only
 * from a branch's own short code (already unique per organization,
 * never a secret) and a plain incrementing counter. No UUID, no PII, no
 * credential of any kind (docs task Phase 3). Unique only within the
 * issuing organization, not platform-wide — see the `Receipt.
 * receiptNumber` schema comment for why a global constraint would be
 * wrong (two different organizations may share a branch code).
 */
export function formatReceiptNumber(branchCode: string, year: number, sequence: number): string {
  return `${branchCode}-${year}-${String(sequence).padStart(SEQUENCE_PADDING, '0')}`;
}
