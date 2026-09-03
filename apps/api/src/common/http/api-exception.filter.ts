import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { RequestWithId } from '../middleware/request-id.middleware.js';

interface HttpErrorBody {
  code?: unknown;
  message?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorBody = this.getErrorBody(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled request failure requestId=${request.requestId}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const responseBody = {
      error: {
        code: errorBody.code ?? this.defaultCode(status),
        message: errorBody.message ?? this.defaultMessage(status),
        retryable: status >= HttpStatus.INTERNAL_SERVER_ERROR,
      },
      meta: {
        requestId: request.requestId,
      },
    };

    this.httpAdapterHost.httpAdapter.reply(
      context.getResponse(),
      responseBody,
      status,
    );
  }

  private getErrorBody(exception: unknown): {
    code?: string;
    message?: string;
  } {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response };
    }

    const body = response as HttpErrorBody;
    const message = Array.isArray(body.message)
      ? 'Request validation failed'
      : typeof body.message === 'string'
        ? body.message
        : undefined;

    return {
      code: typeof body.code === 'string' ? body.code : undefined,
      message,
    };
  }

  private defaultCode(status: number): string {
    const knownCodes: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    };

    return knownCodes[status] ?? 'INTERNAL_SERVER_ERROR';
  }

  private defaultMessage(status: number): string {
    return status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? 'An unexpected error occurred'
      : 'The request could not be completed';
  }
}
