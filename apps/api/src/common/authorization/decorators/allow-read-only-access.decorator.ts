import { SetMetadata } from '@nestjs/common';

export const ALLOW_READ_ONLY_ACCESS_KEY = 'allowReadOnlyAccess';

/**
 * Marks a mutating route as safe under a READ_ONLY subscription access
 * mode. By default TenantAccessGuard infers "is this a mutation" from the
 * HTTP method (anything but GET/HEAD/OPTIONS) and blocks it under
 * READ_ONLY — this decorator is the explicit escape hatch for the rare
 * write that should still be allowed (e.g. acknowledging a notice).
 */
export const AllowReadOnlyAccess = () =>
  SetMetadata(ALLOW_READ_ONLY_ACCESS_KEY, true);
