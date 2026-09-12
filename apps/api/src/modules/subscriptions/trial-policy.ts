/**
 * The default trial policy applied when a new business is onboarded.
 *
 * This is deliberately a small application policy rather than a tenant
 * setting: every newly-created business receives the same Starter trial,
 * while the subscription row remains the source of truth for its actual
 * start and end timestamps.
 */
export const DEFAULT_TRIAL_PLAN_CODE = 'starter';
export const DEFAULT_TRIAL_PERIOD_DAYS = 30;

export function trialEndAt(startedAt: Date): Date {
  return new Date(
    startedAt.getTime() + DEFAULT_TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );
}
