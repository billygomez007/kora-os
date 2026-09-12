import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ResendEmailSender } from './resend-email-sender.js';

function config(apiKey = 're_do_not_leak_this_00000000000000000000'): ConfigService {
  return new ConfigService({ NODE_ENV: 'production', RESEND_API_KEY: apiKey });
}

describe('ResendEmailSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('blocks external delivery in test mode even when a provider key is present', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sender = new ResendEmailSender(
      new ConfigService({
        NODE_ENV: 'test',
        RESEND_API_KEY: 're_do_not_leak_this_00000000000000000000',
      }),
    );

    await expect(
      sender.send({
        from: 'Kora OS <login@koraafric.com>',
        to: 'person@example.test',
        subject: 'Test email',
        text: 'Test email',
        html: '<p>Test email</p>',
      }),
    ).rejects.toThrow('External email delivery is disabled in test environment');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the transactional message to the HTTPS API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-id' }), {
        status: 200,
        headers: { 'x-resend-request-id': 'req_123' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sender = new ResendEmailSender(config());

    const result = await sender.send({
      from: 'Kora OS <login@koraafric.com>',
      to: 'person@example.test',
      subject: 'Sign-in code',
      text: 'Your code is 123456',
      html: '<p>Your code is 123456</p>',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_do_not_leak_this_00000000000000000000',
          'Content-Type': 'application/json',
        },
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: 'Kora OS <login@koraafric.com>',
      to: 'person@example.test',
    });
    expect(result).toEqual({ providerMessageId: 'email-id' });
  });

  it('classifies Resend rate limits as retryable and respects Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 429,
          headers: {
            'x-resend-request-id': 'req_rate_1',
            'retry-after': '17',
          },
        }),
      ),
    );
    const sender = new ResendEmailSender(config());

    await expect(
      sender.send({
        from: 'Kora OS <login@koraafric.com>',
        to: 'person@example.test',
        subject: 'Invitation',
        text: 'Invitation',
        html: '<p>Invitation</p>',
      }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      requestId: 'req_rate_1',
      retryAfterSeconds: 17,
      retryable: true,
    });
  });

  it('classifies permanent provider rejection as non-retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 422,
          headers: { 'x-resend-request-id': 'req_invalid_1' },
        }),
      ),
    );
    const sender = new ResendEmailSender(config());

    await expect(
      sender.send({
        from: 'Kora OS <login@koraafric.com>',
        to: 'person@example.test',
        subject: 'Invitation',
        text: 'Invitation',
        html: '<p>Invitation</p>',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      status: 422,
      retryable: false,
    });
  });

  it('fails safely on provider rejection and logs only safe metadata', async () => {
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('secret provider details', {
          status: 422,
          headers: { 'x-resend-request-id': 'req_safe_1' },
        }),
      ),
    );
    const sender = new ResendEmailSender(config());

    await expect(
      sender.send({
        from: 'Kora OS <login@koraafric.com>',
        to: 'person@example.test',
        subject: 'Sign-in code',
        text: '123456',
        html: '<p>123456</p>',
      }),
    ).rejects.toThrow('Resend email delivery failed');

    const logged = loggerError.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('provider=resend');
    expect(logged).toContain('status=422');
    expect(logged).toContain('requestId=req_safe_1');
    expect(logged).not.toContain('secret provider details');
    expect(logged).not.toContain('re_do_not_leak');
    expect(logged).not.toContain('123456');
  });

  it('classifies network failures without exposing the underlying error', async () => {
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket details and API key')));
    const sender = new ResendEmailSender(config());

    await expect(
      sender.send({
        from: 'Kora OS <login@koraafric.com>',
        to: 'person@example.test',
        subject: 'Sign-in code',
        text: '123456',
        html: '<p>123456</p>',
      }),
    ).rejects.toThrow('Resend email delivery failed');

    const logged = loggerError.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('provider=resend');
    expect(logged).not.toContain('socket details');
    expect(logged).not.toContain('API key');
  });
});
