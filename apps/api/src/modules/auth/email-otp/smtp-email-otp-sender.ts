import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  EmailOtpDeliveryParams,
  EmailOtpSender,
} from './email-otp-sender.interface.js';
import { EmailDeliveryUnavailableError } from './unconfigured-email-otp-sender.js';

// A user-facing sign-in request should never hang waiting on a slow or
// unreachable mail server — these bound every phase of the SMTP
// conversation so a delivery attempt always resolves (success or
// EmailDeliveryUnavailableError) well within a request timeout, rather
// than relying on nodemailer's own considerably longer defaults.
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 15_000;

/**
 * SMTP delivery adapter behind the EmailOtpSender port. Selected whenever
 * EMAIL_DELIVERY_MODE=smtp (see environment.ts and EmailOtpModule) —
 * development points this at the local Mailpit container
 * (infrastructure/compose.yaml, no real provider); production points the
 * same SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/EMAIL_FROM values at
 * Resend (docs/operations/EMAIL_OTP_PRODUCTION_SETUP.md) — smtp.resend.com,
 * username "resend", the Resend API key as the password. No provider-
 * specific code exists here or needs to: this class only ever talks
 * standard SMTP, so the same adapter serves Mailpit locally and Resend in
 * production purely through configuration.
 *
 * `logger`/`debug` are explicitly left off (nodemailer defaults to off,
 * but this is pinned rather than relied on): those options print raw SMTP
 * protocol traffic, which for this transport's DATA command includes the
 * OTP code itself. Every failure is caught here and re-thrown as
 * EmailDeliveryUnavailableError with only the error's name logged — never
 * the message, since SMTP client libraries routinely echo the remote
 * server's response text (which can itself echo back parts of the
 * request, or a provider's own diagnostic detail) into Error#message.
 */
@Injectable()
export class SmtpEmailOtpSender implements EmailOtpSender {
  private readonly logger = new Logger(SmtpEmailOtpSender.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    this.fromAddress = config.getOrThrow<string>('EMAIL_FROM');
    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      // true selects implicit TLS from the first byte (port 465 — Resend's
      // recommended port); false leaves nodemailer's default opportunistic
      // STARTTLS in place for the alternative port 587, which Resend's
      // server always offers. Either way, certificate validation is never
      // disabled (no rejectUnauthorized override anywhere in this file).
      secure: config.getOrThrow<boolean>('SMTP_SECURE'),
      auth: user && password ? { user, pass: password } : undefined,
      logger: false,
      debug: false,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    });
  }

  async send(params: EmailOtpDeliveryParams): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.emailNormalized,
        subject: 'Your Kora OS sign-in code',
        text: buildOtpEmailText(params),
        html: buildOtpEmailHtml(params),
      });
    } catch (error) {
      this.logger.error(
        `Email OTP delivery via SMTP failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      throw new EmailDeliveryUnavailableError();
    }
  }
}

function formatExpiry(expiryMinutes: number): string {
  return `${expiryMinutes} minute${expiryMinutes === 1 ? '' : 's'}`;
}

/**
 * Plain-text alternative — every email client that cannot or will not
 * render `buildOtpEmailHtml` falls back to this, so it carries the exact
 * same information, never a shortened or different message.
 */
function buildOtpEmailText(params: EmailOtpDeliveryParams): string {
  const expiry = formatExpiry(params.expiryMinutes);
  return [
    'Your Kora OS sign-in code',
    '',
    'Use this code to securely sign in to Kora OS:',
    '',
    params.code,
    '',
    `This code expires in ${expiry}. Never share this code with anyone. Kora OS will never ask you to provide it by phone, chat, or social media.`,
    '',
    'If you did not request this code, you can safely ignore this email.',
    '',
    'Kora OS',
  ].join('\n');
}

/**
 * Deliberately minimal, inline-styled, table-free HTML: every email
 * client renders it without any external image or stylesheet request
 * (docs task "No external images required to understand the email"), and
 * there is no open/click tracking pixel or link of any kind — see
 * docs/operations/EMAIL_OTP_PRODUCTION_SETUP.md for disabling Resend's
 * own account-level tracking too. No marketing content, no support link,
 * no password language.
 */
function buildOtpEmailHtml(params: EmailOtpDeliveryParams): string {
  const expiry = formatExpiry(params.expiryMinutes);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:#0b1220;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e6e9ef;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#f2b705;">Kora OS</p>
      <p style="margin:0 0 8px;font-size:16px;">Use this code to securely sign in to Kora OS:</p>
      <p style="margin:16px 0;font-size:32px;font-weight:700;letter-spacing:4px;color:#ffffff;">${escapeHtml(params.code)}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#c3c9d4;">
        This code expires in ${escapeHtml(expiry)}. Never share this code with anyone.
        Kora OS will never ask you to provide it by phone, chat, or social media.
      </p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#c3c9d4;">
        If you did not request this code, you can safely ignore this email.
      </p>
      <p style="margin:0;font-size:12px;color:#7b8393;">Kora OS</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
