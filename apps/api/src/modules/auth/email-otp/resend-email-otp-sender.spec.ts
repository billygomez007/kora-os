import { ConfigService } from '@nestjs/config';
import { ResendEmailOtpSender } from './resend-email-otp-sender.js';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';

function config(): ConfigService {
  return new ConfigService({
    RESEND_API_KEY: 're_do_not_leak_this_00000000000000000000',
    OTP_FROM_EMAIL: 'Kora OS <login@koraafric.com>',
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
      code: '123456',
      expiresAt: new Date(),
      expiryMinutes: 10,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.from).toBe('Kora OS <login@koraafric.com>');
    expect(body.to).toBe('person@example.test');
    expect(body.text).toContain('123456');
    expect(body.html).toContain('123456');
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
