import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { StaffInvitationEmailService } from './staff-invitation-email.service.js';

function config(): ConfigService {
  return new ConfigService({
    NODE_ENV: 'production',
    EMAIL_DELIVERY_MODE: 'resend',
    RESEND_API_KEY: 're_do_not_leak_this_00000000000000000000',
    INVITATION_FROM_EMAIL: 'Kora OS Invitations <invite@koraafric.com>',
    KORA_WEB_URL: 'https://koraafric.com',
  });
}

const params = {
  email: 'person@example.test',
  organizationName: 'Kora Demo',
  roleName: 'Manager',
  branchName: 'Accra',
  rawToken: 'invite-token-value',
  expiresAt: new Date('2030-01-02T03:04:00.000Z'),
};

describe('StaffInvitationEmailService with Resend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the invitation through Resend with the configured sender and URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new StaffInvitationEmailService(config());

    await service.send(params);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.from).toBe('Kora OS Invitations <invite@koraafric.com>');
    expect(body.to).toBe(params.email);
    expect(body.text).toContain('https://koraafric.com/invite/invite-token-value');
    expect(body.html).toContain('https://koraafric.com/invite/invite-token-value');
  });

  it('reports a truthful service-unavailable error when Resend fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider details')));
    const service = new StaffInvitationEmailService(config());

    await expect(service.send(params)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('preserves a retryable 429 classification for the invitation workflow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 429,
          headers: {
            'x-resend-request-id': 'req_invite_rate_1',
            'retry-after': '12',
          },
        }),
      ),
    );
    const service = new StaffInvitationEmailService(config());

    await expect(
      service.send({ ...params, invitationId: 'invitation-1', attemptNumber: 1 }),
    ).rejects.toMatchObject({
      deliveryCode: 'RATE_LIMITED',
      retryable: true,
      retryAfterSeconds: 12,
    });
  });
});
