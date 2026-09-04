import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';

const sendMail = vi.fn();
const createTransport = vi.fn((_options: unknown) => ({ sendMail }));

vi.mock('nodemailer', () => ({
  default: { createTransport: (options: unknown) => createTransport(options) },
}));

const { SmtpEmailOtpSender } = await import('./smtp-email-otp-sender.js');

function createConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return new ConfigService({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    EMAIL_FROM: 'Kora <no-reply@kora.local>',
    ...overrides,
  });
}

describe('SmtpEmailOtpSender', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: 'stub' });
    createTransport.mockClear();
  });

  it('never enables nodemailer debug/logger transport options', () => {
    new SmtpEmailOtpSender(createConfig());

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ logger: false, debug: false }),
    );
  });

  it('sends the code in the message body to the normalized recipient', async () => {
    const sender = new SmtpEmailOtpSender(createConfig());
    const expiresAt = new Date('2026-01-01T00:10:00.000Z');

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '482913',
      expiresAt,
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('someone@example.test');
    expect(message.from).toBe('Kora <no-reply@kora.local>');
    expect(message.text).toContain('482913');
  });

  it('omits auth entirely when no SMTP credentials are configured (Mailpit)', () => {
    new SmtpEmailOtpSender(createConfig());

    const options = createTransport.mock.calls[0][0] as { auth?: unknown };
    expect(options.auth).toBeUndefined();
  });

  it('passes credentials through when both are configured', () => {
    new SmtpEmailOtpSender(
      createConfig({ SMTP_USER: 'a-user', SMTP_PASSWORD: 'a-password' }),
    );

    const options = createTransport.mock.calls[0][0] as {
      auth?: { user: string; pass: string };
    };
    expect(options.auth).toEqual({ user: 'a-user', pass: 'a-password' });
  });

  it('never logs the OTP code, and translates any send failure into EmailDeliveryUnavailableError without leaking the underlying error message', async () => {
    // SmtpEmailOtpSender logs through Nest's Logger (not console.* — Nest
    // writes to process.stdout/stderr directly), so the spy targets the
    // method our code actually calls.
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error');
    sendMail.mockRejectedValueOnce(
      new Error(
        '550 5.1.1 someone@example.test: Recipient address rejected — sensitive-provider-diagnostic',
      ),
    );
    const sender = new SmtpEmailOtpSender(createConfig());

    await expect(
      sender.send({
        emailNormalized: 'someone@example.test',
        code: '999111',
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);

    const logged = loggerErrorSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('999111');
    expect(logged).not.toContain('sensitive-provider-diagnostic');
    expect(logged).not.toContain('someone@example.test');

    loggerErrorSpy.mockRestore();
  });
});
