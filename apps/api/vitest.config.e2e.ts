import { defineConfig } from 'vitest/config';

// E2E fixtures must never inherit live email configuration from a developer
// shell or the repository .env file.
process.env.NODE_ENV = 'test';
for (const key of [
  'EMAIL_DELIVERY_MODE',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM',
  'OTP_FROM_EMAIL',
  'INVITATION_FROM_EMAIL',
]) {
  delete process.env[key];
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every e2e file boots a real Nest application (sometimes several,
    // one per test) against the same local PostgreSQL container. Running
    // files in parallel serializes on that one shared resource anyway and
    // was observed to intermittently exceed the default 5s test timeout
    // under that contention — serializing files trades a little wall time
    // for reliability, and a longer timeout covers the remaining slower
    // multi-request flows (e.g. staff invitation creation + acceptance).
    fileParallelism: false,
    testTimeout: 20_000,
    // Queue/service-session fixtures (extendWithQueueRoles) add two more
    // real OTP sign-ins on top of createBookableFixture's own two,
    // occasionally pushing a `beforeEach` past the default 10s
    // hookTimeout under load — the same "real requests against a shared
    // Postgres container" reasoning as testTimeout above, just for setup
    // rather than test bodies.
    hookTimeout: 20_000,
  },
});
