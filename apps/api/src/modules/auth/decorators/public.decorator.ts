import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or every route on a controller) as exempt from
 * JwtAuthGuard — for the auth endpoints themselves (register/login/
 * refresh) and for public discovery routes, which customer-workspace
 * users, business-workspace users, and anonymous visitors can all reach
 * without a session.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
