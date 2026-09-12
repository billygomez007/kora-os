const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns whole trial days remaining, rounded up so a trial with any time
 * left today still shows one day. Invalid or missing dates are unavailable.
 */
export function trialDaysRemaining(
  trialEndsAt: string | null | undefined,
  now = new Date(),
): number | null {
  if (!trialEndsAt) return null;

  const end = new Date(trialEndsAt).getTime();
  const current = now.getTime();
  if (!Number.isFinite(end) || !Number.isFinite(current)) return null;

  return Math.max(0, Math.ceil((end - current) / DAY_MS));
}
