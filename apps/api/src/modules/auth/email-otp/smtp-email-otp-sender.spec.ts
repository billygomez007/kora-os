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
    EMAIL_FROM: 'Kora OS <no-reply@kora.local>',
    ...overrides,
  });
}

/** Legacy SMTP configuration coverage. Production uses the Resend HTTPS
 * adapter; these tests keep local Mailpit and SMTP compatibility intact. */
function resendConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return createConfig({
    SMTP_HOST: 'smtp.resend.com',
    SMTP_PORT: 465,
    SMTP_SECURE: true,
    SMTP_USER: 'resend',
    SMTP_PASSWORD: 're_placeholder_not_a_real_key',
    EMAIL_FROM: 'Kora OS <login@koraafric.com>',
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

  it('bounds every phase of the SMTP conversation so a send can never hang indefinitely', () => {
    new SmtpEmailOtpSender(createConfig());

    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(options.connectionTimeout).toBeGreaterThan(0);
    expect(options.greetingTimeout).toBeGreaterThan(0);
    expect(options.socketTimeout).toBeGreaterThan(0);
  });

  it('never disables TLS certificate validation', () => {
    new SmtpEmailOtpSender(resendConfig());

    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(options.rejectUnauthorized).not.toBe(false);
    expect(options.tls).toBeUndefined();
  });

  it('sends the code in the message body to the normalized recipient', async () => {
    const sender = new SmtpEmailOtpSender(createConfig());
    const expiresAt = new Date('2026-01-01T00:10:00.000Z');

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '482913',
      expiresAt,
      expiryMinutes: 10,
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('someone@example.test');
    expect(message.from).toBe('Kora OS <no-reply@kora.local>');
    expect(message.subject).toBe('Your Kora OS sign-in code');
    expect(message.text).toContain('482913');
    expect(message.html).toContain('482913');
  });

  it('uses the configured Resend sender identity exactly, name and address together', async () => {
    const sender = new SmtpEmailOtpSender(resendConfig());

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '111222',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    expect(sendMail.mock.calls[0][0].from).toBe('Kora OS <login@koraafric.com>');
  });

  it('configures implicit TLS on port 465 (Resend\'s recommended configuration) exactly as given', () => {
    new SmtpEmailOtpSender(resendConfig());

    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(options.host).toBe('smtp.resend.com');
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
    expect(options.auth).toEqual({ user: 'resend', pass: 're_placeholder_not_a_real_key' });
  });

  it('supports the alternative STARTTLS port 587 configuration, secure:false so nodemailer negotiates STARTTLS', () => {
    new SmtpEmailOtpSender(resendConfig({ SMTP_PORT: 587, SMTP_SECURE: false }));

    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(options.port).toBe(587);
    expect(options.secure).toBe(false);
    // secure:false does not disable TLS outright — nodemailer still
    // upgrades via STARTTLS when the server offers it, and never sets
    // ignoreTLS here, so that opportunistic upgrade is never suppressed.
    expect(options.ignoreTLS).not.toBe(true);
  });

  it("states the exact configured expiry in the email, in both the plain-text and HTML bodies — never a raw timestamp", async () => {
    const sender = new SmtpEmailOtpSender(createConfig());

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '482913',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      expiryMinutes: 10,
    });

    const message = sendMail.mock.calls[0][0];
    expect(message.text).toContain('This code expires in 10 minutes.');
    expect(message.html).toContain('10 minutes');
    expect(message.text).not.toContain('2099');
    expect(message.html).not.toContain('2099');
  });

  it('correctly pluralizes a single-minute expiry', async () => {
    const sender = new SmtpEmailOtpSender(createConfig());

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '482913',
      expiresAt: new Date(),
      expiryMinutes: 1,
    });

    expect(sendMail.mock.calls[0][0].text).toContain('This code expires in 1 minute.');
  });

  it('the email explains what the code is for, warns against sharing it, and tells an unexpected recipient it is safe to ignore', async () => {
    const sender = new SmtpEmailOtpSender(createConfig());

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '482913',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    const message = sendMail.mock.calls[0][0];
    for (const body of [message.text, message.html]) {
      expect(body).toMatch(/sign in to Kora OS/i);
      expect(body).toMatch(/never share this code/i);
      expect(body).toMatch(/did not request this code.*safely ignore/is);
      expect(body).not.toMatch(/password/i);
      expect(body).not.toMatch(/click here|unsubscribe|http:\/\/|https:\/\//i);
    }
  });

  it('the HTML body requires no external image or stylesheet to be understood', async () => {
    const sender = new SmtpEmailOtpSender(createConfig());

    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '482913',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    const html = sendMail.mock.calls[0][0].html as string;
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/url\(/i);
  });

  it('escapes the code in the HTML body rather than interpolating it unescaped', async () => {
    const sender = new SmtpEmailOtpSender(createConfig());

    // A code is always digits in practice, but the HTML builder must not
    // assume that — proves it treats the value as untrusted text.
    await sender.send({
      emailNormalized: 'someone@example.test',
      code: '<b>482913</b>',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    const html = sendMail.mock.calls[0][0].html as string;
    expect(html).not.toContain('<b>482913</b>');
    expect(html).toContain('&lt;b&gt;482913&lt;/b&gt;');
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

  it('logs safe SMTP diagnostics without the OTP, recipient, or provider message', async () => {
    // SmtpEmailOtpSender logs through Nest's Logger (not console.* — Nest
    // writes to process.stdout/stderr directly), so the spy targets the
    // method our code actually calls.
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error');
    const error = Object.assign(
      new Error('550 5.1.1 someone@example.test: sensitive-provider-diagnostic'),
      { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 },
    );
    sendMail.mockRejectedValueOnce(error);
    const sender = new SmtpEmailOtpSender(createConfig());

    await expect(
      sender.send({
        emailNormalized: 'someone@example.test',
        code: '999111',
        expiresAt: new Date(),
        expiryMinutes: 10,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);

    const logged = loggerErrorSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('999111');
    expect(logged).not.toContain('sensitive-provider-diagnostic');
    expect(logged).not.toContain('someone@example.test');
    expect(logged).toContain('code=EENVELOPE');
    expect(logged).toContain('command=RCPT_TO');
    expect(logged).toContain('responseCode=550');

    loggerErrorSpy.mockRestore();
  });

  it('never leaks the SMTP password/API key when authentication itself is rejected', async () => {
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error');
    const realApiKey = 're_do_not_leak_this_00000000000000000000';
    sendMail.mockRejectedValueOnce(
      Object.assign(
        new Error(`535 5.7.8 Authentication failed: invalid API key ${realApiKey}`),
        { code: 'EAUTH', command: 'AUTH', responseCode: 535 },
      ),
    );
    const sender = new SmtpEmailOtpSender(resendConfig({ SMTP_PASSWORD: realApiKey }));

    let thrown: unknown;
    try {
      await sender.send({
        emailNormalized: 'someone@example.test',
        code: '999111',
        expiresAt: new Date(),
        expiryMinutes: 10,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmailDeliveryUnavailableError);
    expect((thrown as Error).message).not.toContain(realApiKey);
    const logged = loggerErrorSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain(realApiKey);
    expect(logged).toContain('code=EAUTH');
    expect(logged).toContain('command=AUTH');
    expect(logged).toContain('responseCode=535');

    loggerErrorSpy.mockRestore();
  });

  it('classifies connection failures without logging the connection error message', async () => {
    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error');
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED internal-host:465'), {
        code: 'ECONNECTION',
        command: 'CONN',
      }),
    );
    const sender = new SmtpEmailOtpSender(resendConfig());

    await expect(
      sender.send({
        emailNormalized: 'someone@example.test',
        code: '999111',
        expiresAt: new Date(),
        expiryMinutes: 10,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);

    const logged = loggerErrorSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('ECONNREFUSED internal-host:465');
    expect(logged).toContain('code=ECONNECTION');
    expect(logged).toContain('command=CONN');
    expect(logged).toContain('responseCode=none');

    loggerErrorSpy.mockRestore();
  });
});
