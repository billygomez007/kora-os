import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ApiResponseInterceptor } from './api-response.interceptor.js';

function createContext(requestId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ requestId }) }),
  } as unknown as ExecutionContext;
}

function createHandler(returnValue: unknown): CallHandler {
  return { handle: () => of(returnValue) } as CallHandler;
}

describe('ApiResponseInterceptor', () => {
  const interceptor = new ApiResponseInterceptor();

  it('wraps a single-resource result under data', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(createContext('req-1'), createHandler({ id: 'org-1' })),
    );
    expect(result).toEqual({ data: { id: 'org-1' }, meta: { requestId: 'req-1' } });
  });

  it('hoists page alongside data for a paginated result', async () => {
    const paginated = { data: [{ id: 'a' }, { id: 'b' }], page: { nextCursor: 'xyz', hasMore: true } };
    const result = await firstValueFrom(
      interceptor.intercept(createContext('req-2'), createHandler(paginated)),
    );
    expect(result).toEqual({
      data: paginated.data,
      page: paginated.page,
      meta: { requestId: 'req-2' },
    });
  });

  it('does not treat an ordinary object that happens to have a data field as paginated', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(
        createContext('req-3'),
        createHandler({ data: 'not-an-array', other: true }),
      ),
    );
    expect(result).toEqual({
      data: { data: 'not-an-array', other: true },
      meta: { requestId: 'req-3' },
    });
  });

  it('wraps an empty array result as normal data, not as a paginated payload', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(createContext('req-4'), createHandler([])),
    );
    expect(result).toEqual({ data: [], meta: { requestId: 'req-4' } });
  });
});
