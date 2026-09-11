import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailMessage, EmailSender } from './email-sender.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

export class ResendEmailDeliveryError extends Error {
  constructor() {
    super('Resend email delivery failed');
    this.name = 'ResendEmailDeliveryError';
  }
}

/** Minimal HTTPS adapter for Resend's documented /emails endpoint. */
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('RESEND_API_KEY');
  }

  async send(message: EmailMessage): Promise<void> {
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
        throw new ResendHttpError(response.status, response.headers.get('x-resend-request-id'));
      }
    } catch (error) {
      this.logger.error(`Resend email delivery failed (${resendFailureMetadata(error)})`);
      throw new ResendEmailDeliveryError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

class ResendHttpError extends Error {
  constructor(
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super('Resend request failed');
    this.name = 'ResendHttpError';
  }
}

function resendFailureMetadata(error: unknown): string {
  if (error instanceof ResendHttpError) {
    const requestId = safeToken(error.requestId);
    return `provider=resend status=${error.status} requestId=${requestId}`;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'provider=resend status=timeout error=AbortError';
  }
  const name = error instanceof Error ? safeToken(error.name) : 'unknown';
  return `provider=resend status=none error=${name}`;
}

function safeToken(value: string | null): string {
  if (!value) return 'none';
  const normalized = value.trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(normalized) ? normalized : 'redacted';
}
