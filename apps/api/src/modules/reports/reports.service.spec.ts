import { ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service.js';

describe('ReportsService plan gates', () => {
  it('requires the cash reconciliation entitlement before reading cash sessions', async () => {
    const prisma = {
      cashSession: { findMany: vi.fn() },
    };
    const entitlements = {
      requireForOrganization: vi.fn().mockRejectedValue(
        new ForbiddenException({ code: 'PLAN_ENTITLEMENT_REQUIRED' }),
      ),
    };
    const service = new ReportsService(prisma as never, entitlements as never);

    await expect(
      service.cashReconciliation(
        { organizationId: 'org-1', branchIds: [], permissionCodes: [] } as never,
        { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' },
      ),
    ).rejects.toMatchObject({ response: { code: 'PLAN_ENTITLEMENT_REQUIRED' } });
    expect(prisma.cashSession.findMany).not.toHaveBeenCalled();
    expect(entitlements.requireForOrganization).toHaveBeenCalledWith(
      'org-1',
      'cash.reconciliation',
    );
  });
});
