import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendEmailOtpSender } from './resend-email-otp-sender.js';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';

function config(overrides: Record<string, unknown> = {}): ConfigService {
  return new ConfigService({
    RESEND_API_KEY: 're_do_not_leak_this_00000000000000000000',
    OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
    ...overrides,
  });
}

describe('ResendEmailOtpSender', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the existing OTP template through Resend HTTPS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = new ResendEmailOtpSender(config());

    await sender.send({
      emailNormalized: 'person@example.test',
      code: '000003',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.from).toBe('Kora OS <login@koraafric.com>');
    expect(body.to).toBe('person@example.test');
    expect(body.text).toContain('000003');
    expect(body.html).toContain('000003');
  });

  it('confirms, without logging the code, that the exact code reached both rendered bodies before Resend dispatch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const sender = new ResendEmailOtpSender(config({ OTP_DIAGNOSTICS: true }));

    await sender.send({
      emailNormalized: 'person@example.test',
      code: '000003',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    const logs = loggerWarn.mock.calls.flat().map(String);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /event=email_template_rendered codeLength=6 textCarriesCode=yes htmlCarriesCode=yes/,
        ),
      ]),
    );
    expect(logs.join('\n')).not.toContain('000003');
    loggerWarn.mockRestore();
  });

  it('converts Resend failures into the existing safe OTP delivery error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider details')));
    const sender = new ResendEmailOtpSender(config());

    await expect(
      sender.send({
        emailNormalized: 'person@example.test',
        code: '123456',
        expiresAt: new Date(),
        expiryMinutes: 10,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);
  });
});
