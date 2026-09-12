import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionAccessMode } from '../../generated/prisma/client.js';
import { ALLOW_READ_ONLY_ACCESS_KEY } from './decorators/allow-read-only-access.decorator.js';
import { ANY_PERMISSIONS_KEY } from './decorators/require-any-permission.decorator.js';
import { BRANCH_PARAM_KEY } from './decorators/require-branch-param.decorator.js';
import { ENTITLEMENTS_KEY } from './decorators/require-entitlement.decorator.js';
import { PERMISSIONS_KEY } from './decorators/require-permissions.decorator.js';
import type { TenantScopedRequest } from './interfaces/tenant-context.interface.js';
import { TenantContextService } from './tenant-context.service.js';
import { EntitlementsService } from '../../modules/subscriptions/entitlements.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const ORGANIZATION_ID_HEADER = 'x-kora-organization-id';
export const BRANCH_ID_HEADER = 'x-kora-branch-id';
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

/**
 * Applied per-route (not globally — JwtAuthGuard already runs globally
 * and proves the user; this guard proves organization access on top of
 * that). Enforces, in order:
 *
 * 1. Membership — the authenticated user must hold an ACTIVE membership
 *    in the requested organization (docs task Phase 7: "Membership
 *    proves access to an organization").
 * 2. Subscription access mode — BLOCKED denies everything; READ_ONLY
 *    denies mutating requests unless explicitly marked safe.
 * 3. Permissions — every code named by @RequirePermissions must be in
 *    the membership's resolved permission set.
 * 4. Any-of permissions — when @RequireAnyPermission names one or more
 *    codes, at least one must be in the membership's resolved permission
 *    set. This is the OR counterpart to step 3's AND semantics, for a
 *    route more than one permission legitimately reaches (see that
 *    decorator's own doc comment) — always a coarse gate only; the
 *    service layer still narrows what each specific permission actually
 *    allows once past this guard.
 * 5. Branch scope — when @RequireBranchParam names a route param, the
 *    membership must either have that branch explicitly assigned or hold
 *    the broad `branches.manage` permission.
 * 6. Plan entitlements — when @RequireEntitlement names one or more
 *    feature entitlements, every one must be enabled by the organization's
 *    current subscription plan.
 *
 * The organization ID is read from the `:organizationId` route param
 * (falling back to the X-Kora-Organization-Id header) and is only ever a
 * *selector* — access is granted by the resolved membership row, never by
 * the caller supplying the ID (docs task Phase 7: "Never accept
 * organizationId from a request body as authorization evidence").
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContextService: TenantContextService,
    @Optional()
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    const organizationId =
      firstValue(request.params.organizationId) ??
      firstValue(request.headers[ORGANIZATION_ID_HEADER]);
    if (!organizationId) {
      throw new ForbiddenException('An organization context is required');
    }

    const tenantContext = await this.tenantContextService.resolve(
      request.authUser.id,
      organizationId,
    );
    if (!tenantContext) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    if (tenantContext.accessMode === SubscriptionAccessMode.BLOCKED) {
      throw new ForbiddenException(
        "This organization's subscription does not permit this action",
      );
    }

    const isMutating = !SAFE_METHODS.has(request.method);
    const allowReadOnly = this.reflector.getAllAndOverride<boolean>(
      ALLOW_READ_ONLY_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      isMutating &&
      !allowReadOnly &&
      tenantContext.accessMode === SubscriptionAccessMode.READ_ONLY
    ) {
      throw new ForbiddenException(
        "This organization's subscription is read-only",
      );
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missingPermission = requiredPermissions.find(
      (code) => !tenantContext.permissionCodes.has(code),
    );
    if (missingPermission) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    const anyOfPermissions =
      this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (
      anyOfPermissions.length > 0 &&
      !anyOfPermissions.some((code) => tenantContext.permissionCodes.has(code))
    ) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    const branchParamName = this.reflector.getAllAndOverride<string>(
      BRANCH_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (branchParamName) {
      const branchId =
        firstValue(request.params[branchParamName]) ??
        firstValue(request.headers[BRANCH_ID_HEADER]);
      const hasBroadBranchAccess = tenantContext.permissionCodes.has(
        BROAD_BRANCH_ACCESS_PERMISSION,
      );
      if (
        branchId &&
        !hasBroadBranchAccess &&
        !tenantContext.branchIds.includes(branchId)
      ) {
        throw new ForbiddenException('You do not have access to this branch');
      }
    }

    const requiredEntitlements = this.reflector.getAllAndOverride<string[]>(
      ENTITLEMENTS_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [];
    for (const code of requiredEntitlements) {
      if (!this.entitlementsService) {
        throw new ForbiddenException({
          code: 'PLAN_ENTITLEMENT_REQUIRED',
          entitlement: code,
          message: `The current plan does not include ${code}. Upgrade the plan to continue.`,
        });
      }
      await this.entitlementsService.requireForOrganization(
        tenantContext.organizationId,
        code,
      );
    }

    request.tenantContext = tenantContext;
    return true;
  }
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
