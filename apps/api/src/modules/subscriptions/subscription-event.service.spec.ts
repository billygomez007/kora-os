import { SubscriptionStatus } from '../../generated/prisma/client.js';
import { SubscriptionEventService } from './subscription-event.service.js';

function createServiceWithStub() {
  const prismaStub = {
    subscriptionEvent: {
      create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new SubscriptionEventService(prismaStub as never);
  return { service, prismaStub };
}

describe('SubscriptionEventService', () => {
  it('inserts a new subscription event', async () => {
    const { service, prismaStub } = createServiceWithStub();

    await service.record({
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      type: 'subscription.trial_started',
      effectiveAt: new Date('2026-09-03T00:00:00.000Z'),
      previousStatus: null,
      newStatus: SubscriptionStatus.TRIALING,
      source: 'test',
    });

    expect(prismaStub.subscriptionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          subscriptionId: 'sub-1',
          newStatus: SubscriptionStatus.TRIALING,
        }),
      }),
    );
  });

  it('reads subscription events scoped to one organization', async () => {
    const { service, prismaStub } = createServiceWithStub();

    await service.listForOrganization('org-1');

    expect(prismaStub.subscriptionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('exposes no update or delete method — subscription history is append-only', () => {
    const { service } = createServiceWithStub();

    expect(
      (service as unknown as Record<string, unknown>).update,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).delete,
    ).toBeUndefined();
  });
});
