import { WorkspacesService } from './workspaces.service.js';

describe('WorkspacesService.getAccessStatus', () => {
  function buildService(membershipCounts: {
    active: number;
    inactive: number;
  }) {
    const prisma = {
      organizationMembership: {
        count: vi.fn(async ({ where }: { where: { status: unknown } }) => {
          const status = where.status;
          if (status === 'ACTIVE') return membershipCounts.active;
          return membershipCounts.inactive;
        }),
      },
    };
    const service = new WorkspacesService(
      prisma as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('reports no inactive membership for a brand-new user with zero memberships of any kind', async () => {
    const { service } = buildService({ active: 0, inactive: 0 });
    await expect(service.getAccessStatus('user-1')).resolves.toEqual({
      hasInactiveMembership: false,
    });
  });

  it('reports an inactive membership when every membership is suspended or removed', async () => {
    const { service } = buildService({ active: 0, inactive: 1 });
    await expect(service.getAccessStatus('user-2')).resolves.toEqual({
      hasInactiveMembership: true,
    });
  });

  it('never reports an inactive membership when at least one ACTIVE membership exists', async () => {
    const { service } = buildService({ active: 1, inactive: 1 });
    await expect(service.getAccessStatus('user-3')).resolves.toEqual({
      hasInactiveMembership: false,
    });
  });
});
