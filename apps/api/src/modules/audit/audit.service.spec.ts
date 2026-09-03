import { AuditService } from './audit.service.js';

function createServiceWithStub() {
  const prismaStub = {
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new AuditService(prismaStub as never);
  return { service, prismaStub };
}

describe('AuditService', () => {
  it('inserts a new audit event', async () => {
    const { service, prismaStub } = createServiceWithStub();

    await service.record({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      action: 'organization.onboarded',
      entityType: 'organization',
      entityId: 'org-1',
      requestId: 'req-1',
      source: 'test',
    });

    expect(prismaStub.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaStub.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          actorUserId: 'user-1',
          action: 'organization.onboarded',
          requestId: 'req-1',
        }),
      }),
    );
  });

  it('reads audit events scoped to one organization', async () => {
    const { service, prismaStub } = createServiceWithStub();

    await service.listForOrganization('org-1');

    expect(prismaStub.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('exposes no update or delete method — audit history is append-only', () => {
    const { service } = createServiceWithStub();

    expect(
      (service as unknown as Record<string, unknown>).update,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).delete,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).remove,
    ).toBeUndefined();
  });
});
