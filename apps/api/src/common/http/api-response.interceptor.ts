import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestWithId } from '../middleware/request-id.middleware.js';

interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * A controller returns this shape to mark a collection response — see
 * docs/API_SPEC.md section 4's collection response (`{data: [], page:
 * {...}, meta: {...}}`, `page` a sibling of `data`, not nested inside
 * it). Anything else returned from a handler is wrapped as a normal
 * single-resource response.
 */
export interface PaginatedPayload<T> {
  data: T[];
  page: PageInfo;
}

interface ApiSuccessResponse<T> {
  data: T;
  page?: PageInfo;
  meta: {
    requestId: string;
  };
}

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();

    return next.handle().pipe(
      map((result) => {
        const meta = { requestId: request.requestId };
        if (isPaginatedPayload(result)) {
          return { data: result.data as T, page: result.page, meta };
        }
        return { data: result, meta };
      }),
    );
  }
}

function isPaginatedPayload(value: unknown): value is PaginatedPayload<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<PaginatedPayload<unknown>>;
  return (
    Array.isArray(candidate.data) &&
    typeof candidate.page === 'object' &&
    candidate.page !== null &&
    'hasMore' in candidate.page &&
    'nextCursor' in candidate.page
  );
}
