import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailMessage, EmailSendResult, EmailSender } from './email-sender.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

export class ResendEmailDeliveryError extends Error {
  constructor(
    readonly code: 'RATE_LIMITED' | 'PROVIDER_REJECTED' | 'NETWORK_ERROR' | 'TIMEOUT',
    readonly status: number | null = null,
    readonly requestId: string | null = null,
    readonly retryAfterSeconds: number | null = null,
    readonly retryable: boolean = false,
  ) {
    super('Resend email delivery failed');
    this.name = 'ResendEmailDeliveryError';
  }
}

/** Minimal HTTPS adapter for Resend's documented /emails endpoint. */
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly testEnvironment: boolean;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.testEnvironment = config.get<string>('NODE_ENV') === 'test';
    // Keep test construction safe even when a developer's shell exports a
    // real key. The sender remains available in production, but test code
    // cannot initialise a live provider transport.
    this.apiKey = this.testEnvironment
      ? ''
      : config.getOrThrow<string>('RESEND_API_KEY');
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.testEnvironment) {
      throw new Error('External email delivery is disabled in test environment');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ResendHttpError(
          response.status,
          response.headers.get('x-resend-request-id'),
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }

      const body = await response.json().catch(() => null) as { id?: unknown } | null;
      return {
        providerMessageId:
          typeof body?.id === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(body.id)
            ? body.id
            : undefined,
      };
    } catch (error) {
      const failure = classifyResendFailure(error);
      this.logger.error(`Resend email delivery failed (${resendFailureMetadata(failure)})`);
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class ResendHttpError extends Error {
  constructor(
    readonly status: number,
    readonly requestId: string | null,
    readonly retryAfterSeconds: number | null,
  ) {
    super('Resend request failed');
    this.name = 'ResendHttpError';
  }
}

function classifyResendFailure(error: unknown): ResendEmailDeliveryError {
  if (error instanceof ResendHttpError) {
    const retryable = error.status === 429 || error.status >= 500;
    return new ResendEmailDeliveryError(
      error.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_REJECTED',
      error.status,
      error.requestId,
      error.retryAfterSeconds,
      retryable,
    );
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ResendEmailDeliveryError('TIMEOUT', null, null, null, true);
  }
  return new ResendEmailDeliveryError('NETWORK_ERROR', null, null, null, true);
}

function resendFailureMetadata(error: ResendEmailDeliveryError): string {
  if (error.code === 'RATE_LIMITED' || error.code === 'PROVIDER_REJECTED') {
    return `provider=resend status=${error.status ?? 'none'} requestId=${safeToken(error.requestId)} code=${error.code}`;
  }
  return `provider=resend status=none error=${error.code}`;
}

function safeToken(value: string | null): string {
  if (!value) return 'none';
  const normalized = value.trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(normalized) ? normalized : 'redacted';
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(Math.ceil(seconds), 86_400);
}
