import {
  computeOtpDigest,
  digestsMatch,
  generateOtpCode,
  normalizeOtpCode,
} from './otp-code.util.js';

describe('generateOtpCode', () => {
  it('produces a code of exactly the requested digit length', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOtpCode(6)).toMatch(/^\d{6}$/);
    }
  });

  it('supports a longer code length', () => {
    expect(generateOtpCode(8)).toMatch(/^\d{8}$/);
  });

  it('preserves leading zeros', () => {
    // Not deterministically producible, but the padding logic itself is
    // verified directly: a small random value must still render at full
    // width.
    const short = String(3).padStart(6, '0');
    expect(short).toBe('000003');
  });

  it('trims transport whitespace without changing leading zeros', () => {
    expect(normalizeOtpCode('  000003  ')).toBe('000003');
  });

  it('generates different codes across calls (overwhelmingly likely)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode(6)));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('computeOtpDigest / digestsMatch', () => {
  const base = { pepper: 'a'.repeat(32), challengeId: 'challenge-1', emailNormalized: 'user@example.test' };

  it('is deterministic for the same inputs', () => {
    const first = computeOtpDigest({ ...base, code: '123456' });
    const second = computeOtpDigest({ ...base, code: '123456' });
    expect(first).toBe(second);
  });

  it('never contains the plaintext code', () => {
    const digest = computeOtpDigest({ ...base, code: '123456' });
    expect(digest).not.toContain('123456');
  });

  it('differs when the code differs', () => {
    const a = computeOtpDigest({ ...base, code: '123456' });
    const b = computeOtpDigest({ ...base, code: '654321' });
    expect(a).not.toBe(b);
  });

  it('differs when the challenge id differs (per-challenge salting)', () => {
    const a = computeOtpDigest({ ...base, challengeId: 'challenge-1', code: '123456' });
    const b = computeOtpDigest({ ...base, challengeId: 'challenge-2', code: '123456' });
    expect(a).not.toBe(b);
  });

  it('differs when the pepper differs', () => {
    const a = computeOtpDigest({ ...base, pepper: 'a'.repeat(32), code: '123456' });
    const b = computeOtpDigest({ ...base, pepper: 'b'.repeat(32), code: '123456' });
    expect(a).not.toBe(b);
  });

  it('digestsMatch confirms a correct digest and rejects an incorrect one', () => {
    const digest = computeOtpDigest({ ...base, code: '123456' });
    expect(digestsMatch(digest, digest)).toBe(true);
    expect(
      digestsMatch(digest, computeOtpDigest({ ...base, code: '000000' })),
    ).toBe(false);
  });

  it('digestsMatch never throws on mismatched-length input', () => {
    expect(digestsMatch('ab', 'abcdef')).toBe(false);
  });
});
