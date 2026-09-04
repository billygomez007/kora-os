import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * `crypto.randomInt` is specified to draw from Node's CSPRNG (not
 * `Math.random`), satisfying the "cryptographically secure random
 * generator" requirement. A `length`-digit code is a uniformly random
 * integer in `[0, 10^length)`, left-padded with zeros — "003456" is a
 * valid 6-digit code, not a shorter one.
 */
export function generateOtpCode(length: number): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

/**
 * HMAC-SHA256(pepper, challengeId:email:code) — keyed so a database-only
 * leak of `codeDigest` cannot be brute-forced offline without the
 * server-side pepper, and salted per-challenge via the challenge ID and
 * email so the same code never produces the same digest twice. The
 * plaintext code is never persisted; only this digest is.
 */
export function computeOtpDigest(params: {
  pepper: string;
  challengeId: string;
  emailNormalized: string;
  code: string;
}): string {
  return createHmac('sha256', params.pepper)
    .update(`${params.challengeId}:${params.emailNormalized}:${params.code}`)
    .digest('hex');
}

/** Timing-safe comparison of two hex digests of (expected) equal length. */
export function digestsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
