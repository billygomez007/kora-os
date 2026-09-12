import { defineConfig } from 'vitest/config';

// Never inherit a developer shell's production/development mode while
// running unit tests. This also makes ConfigModule prefer test-safe sender
// selection over any values loaded from the repository .env file.
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
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
