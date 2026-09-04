/**
 * Hardcoded, documented defaults used whenever a branch has no
 * BranchBookingPolicy row yet (docs task Phase 13: "Use safe documented
 * defaults, but keep policy centralized and editable"). Also see
 * docs/SECURITY.md section 30 and docs/API_SPEC.md's booking-policy
 * section for the same values.
 */
export const DEFAULT_BOOKING_POLICY = {
  slotIntervalMinutes: 15,
  minBookingLeadTimeMinutes: 60,
  maxBookingHorizonDays: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
  cancellationCutoffMinutes: 120,
  allowCustomerProviderSelection: true,
  allowAnyProvider: true,
} as const;

/** Absolute ceiling regardless of a branch's configured horizon — a
 * public availability query can never be widened past this (docs task
 * Phase 15: "Limit date-range queries to a safe maximum"). */
export const MAX_AVAILABILITY_QUERY_DAYS = 14;
