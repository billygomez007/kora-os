import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { EntitlementValueType } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';

type TransactionClient = Prisma.TransactionClient;

export type EntitlementValue = boolean | number | string;
export type ResolvedEntitlements = Record<string, EntitlementValue>;

/**
 * Resolves plan and organization entitlements entirely from database
 * records (plans, entitlement_definitions, plan_entitlements) — limits and
 * feature flags are data-driven, never hard-coded per plan code.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForPlan(
    planId: string,
    client: TransactionClient = this.prisma,
  ): Promise<ResolvedEntitlements> {
    const planEntitlements = await client.planEntitlement.findMany({
      where: { planId },
      include: { entitlement: true },
    });

    const resolved: ResolvedEntitlements = {};
    for (const planEntitlement of planEntitlements) {
      resolved[planEntitlement.entitlement.code] = castEntitlementValue(
        planEntitlement.entitlement.valueType,
        planEntitlement.value,
      );
    }
    return resolved;
  }

  async resolveForOrganization(
    organizationId: string,
    client: TransactionClient = this.prisma,
  ): Promise<ResolvedEntitlements> {
    const subscription = await client.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!subscription) {
      throw new NotFoundException(
        `Organization ${organizationId} has no subscription`,
      );
    }
    return this.resolveForPlan(subscription.planId, client);
  }
}

function castEntitlementValue(
  valueType: EntitlementValueType,
  raw: Prisma.JsonValue,
): EntitlementValue {
  if (valueType === EntitlementValueType.BOOLEAN && typeof raw === 'boolean') {
    return raw;
  }
  if (
    valueType === EntitlementValueType.INTEGER &&
    typeof raw === 'number' &&
    Number.isInteger(raw)
  ) {
    return raw;
  }
  if (valueType === EntitlementValueType.STRING && typeof raw === 'string') {
    return raw;
  }
  throw new Error(
    `Entitlement value ${JSON.stringify(raw)} does not match its declared type ${valueType}`,
  );
}
