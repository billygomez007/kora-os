import type { Request } from 'express';

/** Populated by JwtAuthGuard once an access token has been verified. */
export interface RequestUser {
  id: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  authUser: RequestUser;
}
