import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { TenantContext, TenantScopedRequest } from '../interfaces/tenant-context.interface.js';

/** Injects the TenantContext resolved by TenantAccessGuard. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<TenantScopedRequest>();
    return request.tenantContext;
  },
);
