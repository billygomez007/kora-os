import type { Request } from 'express';

export interface PlatformContext {
  userId: string;
  roleCodes: string[];
  permissionCodes: Set<string>;
}

export interface PlatformScopedRequest extends Request {
  platformContext?: PlatformContext;
}
