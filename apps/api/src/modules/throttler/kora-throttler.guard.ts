import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { RedisThrottlerUnavailableError } from './redis-throttler-storage.js';

/**
 * Authentication and token minting must never silently bypass the shared
 * limiter. The remaining application routes retain the availability policy
 * below while Redis is unavailable.
 */
@Injectable()
export class KoraThrottlerGuard extends ThrottlerGuard {
  override async handleRequest(requestProps: Parameters<ThrottlerGuard['handleRequest']>[0]): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (
        error instanceof RedisThrottlerUnavailableError &&
        isSecuritySensitiveAuthRoute(requestProps.context)
      ) {
        throw new ServiceUnavailableException(
          'Authentication protection is temporarily unavailable',
        );
      }

      if (error instanceof RedisThrottlerUnavailableError) return true;
      throw error;
    }
  }
}

function isSecuritySensitiveAuthRoute(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<{ method?: string; path?: string; originalUrl?: string }>();
  const rawPath = request.path ?? request.originalUrl?.split('?')[0] ?? '';
  const path = rawPath.replace(/^\/v\d+/, '');
  const method = request.method?.toUpperCase();
  return method === 'POST' && [
    '/auth/email-otp/request',
    '/auth/email-otp/verify',
    '/auth/refresh',
    '/auth/browser-access-token',
  ].includes(path);
}
