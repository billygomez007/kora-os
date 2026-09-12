import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRIAL_PERIOD_DAYS,
  DEFAULT_TRIAL_PLAN_CODE,
  trialEndAt,
} from './trial-policy.js';

describe('default trial policy', () => {
  it('uses the Starter plan for a 30-day trial', () => {
    expect(DEFAULT_TRIAL_PLAN_CODE).toBe('starter');
    expect(DEFAULT_TRIAL_PERIOD_DAYS).toBe(30);
  });

  it('calculates the trial end exactly 30 calendar days after the start', () => {
    const startedAt = new Date('2026-01-15T10:30:00.000Z');
    expect(trialEndAt(startedAt)).toEqual(
      new Date('2026-02-14T10:30:00.000Z'),
    );
  });
});
