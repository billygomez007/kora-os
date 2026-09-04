import type { CashRegister } from '../../generated/prisma/client.js';

export interface CashRegisterView {
  id: string;
  organizationId: string;
  branchId: string;
  code: string;
  name: string;
  createdByMembershipId: string;
  archivedAt: string | null;
  archivedByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toCashRegisterView(register: CashRegister): CashRegisterView {
  return {
    id: register.id,
    organizationId: register.organizationId,
    branchId: register.branchId,
    code: register.code,
    name: register.name,
    createdByMembershipId: register.createdByMembershipId,
    archivedAt: register.archivedAt?.toISOString() ?? null,
    archivedByMembershipId: register.archivedByMembershipId,
    createdAt: register.createdAt.toISOString(),
    updatedAt: register.updatedAt.toISOString(),
  };
}
