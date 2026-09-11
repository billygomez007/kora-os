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
 * (infrastructure/compose.yaml, no real provider). Production uses the
 * provider-neutral Resend HTTPS adapter; this class remains the legacy SMTP
 * path for local and compatible deployments.
 *
 * `logger`/`debug` are explicitly left off (nodemailer defaults to off,
 * but this is pinned rather than relied on): those options print raw SMTP
 * protocol traffic, which for this transport's DATA command includes the
 * OTP code itself. Every failure is caught here and re-thrown as
 * EmailDeliveryUnavailableError with only a small, allowlisted diagnostic
 * metadata set logged — never the message, since SMTP client libraries
 * routinely echo the remote
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
      this.logger.error(`Email OTP delivery via SMTP failed (${smtpFailureMetadata(error)})`);
      throw new EmailDeliveryUnavailableError();
    }
  }
}

interface SmtpErrorShape {
  name?: unknown;
  code?: unknown;
  command?: unknown;
  responseCode?: unknown;
}

/**
 * Keep operational SMTP diagnostics useful without ever logging Error#message,
 * which may contain an OTP recipient, provider response, or credential detail.
 */
function smtpFailureMetadata(error: unknown): string {
  const record = error && typeof error === 'object' ? (error as SmtpErrorShape) : {};
  const name = safeDiagnosticToken(
    error instanceof Error ? error.name : record.name,
  );
  const code = safeDiagnosticToken(record.code);
  const command = safeDiagnosticToken(record.command);
  const responseCode =
    typeof record.responseCode === 'number' &&
    Number.isInteger(record.responseCode) &&
    record.responseCode >= 100 &&
    record.responseCode <= 999
      ? String(record.responseCode)
      : 'none';

  return `name=${name} code=${code} command=${command} responseCode=${responseCode}`;
}

function safeDiagnosticToken(value: unknown): string {
  if (typeof value !== 'string') {
    return 'none';
  }
  const normalized = value.trim().replace(/\s+/g, '_');
  return /^[A-Za-z0-9_.-]{1,40}$/.test(normalized) ? normalized : 'none';
}

function formatExpiry(expiryMinutes: number): string {
  return `${expiryMinutes} minute${expiryMinutes === 1 ? '' : 's'}`;
}

/**
 * Plain-text alternative — every email client that cannot or will not
 * render `buildOtpEmailHtml` falls back to this, so it carries the exact
 * same information, never a shortened or different message.
 */
export function buildOtpEmailText(params: EmailOtpDeliveryParams): string {
  const expiry = formatExpiry(params.expiryMinutes);
  return [
    'KORA OS',
    '',
    'Your sign-in code',
    '',
    'Use the verification code below to securely sign in to Kora OS and access your workspace.',
    '',
    params.code,
    '',
    `This code expires in ${expiry}.`,
    '',
    'For your security, never share this code with anyone. Kora OS will never ask you to provide your verification code by phone, chat, or social media.',
    '',
    'If you did not request this code, you can safely ignore this email.',
    '',
    'Kora OS',
    'Run your service business beautifully.',
    'koraafric.com',
    '',
    'A Realtegic product',
  ].join('\n');
}

/**
 * Transactional Kora email template.
 *
 * Email-client-safe HTML with inline styles and no JavaScript, remote
 * stylesheet, tracking pixel, or external asset required to understand
 * the message. The verification code remains the visual focus.
 */
export function buildOtpEmailHtml(params: EmailOtpDeliveryParams): string {
  const expiry = escapeHtml(formatExpiry(params.expiryMinutes));
  const code = escapeHtml(params.code);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Kora OS sign-in code</title>
</head>
<body style="margin:0;padding:0;background-color:#08111f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Your secure Kora OS verification code expires in ${expiry}.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#08111f;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">

          <tr>
            <td style="padding:0 8px 24px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:-0.6px;color:#f5b82e;">
                      Kora<span style="color:#ffffff;"> OS</span>
                    </div>
                    <div style="margin-top:5px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8793a6;">
                      Business Operating System
                    </div>
                  </td>
                  <td align="right" valign="middle" style="font-size:12px;line-height:18px;color:#8793a6;">
                    SECURE SIGN-IN
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#ffffff;border-radius:18px;overflow:hidden;">

              <div style="height:5px;background-color:#f5b82e;font-size:0;line-height:0;">&nbsp;</div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:44px 42px 16px 42px;">

                    <div style="font-size:13px;line-height:20px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#b27a08;">
                      Verification
                    </div>

                    <h1 style="margin:8px 0 14px 0;font-size:30px;line-height:38px;font-weight:800;letter-spacing:-0.8px;color:#0b1423;">
                      Your sign-in code
                    </h1>

                    <p style="margin:0;font-size:16px;line-height:26px;color:#536071;">
                      Use the verification code below to securely sign in to Kora OS and access your workspace.
                    </p>

                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 42px 22px 42px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0b1423;border-radius:14px;border:1px solid #202d40;">
                      <tr>
                        <td align="center" style="padding:27px 18px 25px 18px;">
                          <div style="margin-bottom:8px;font-size:10px;line-height:15px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#9ba6b6;">
                            Your verification code
                          </div>
                          <div style="font-family:'Courier New',Courier,monospace;font-size:38px;line-height:48px;font-weight:700;letter-spacing:8px;color:#f5b82e;">
                            ${code}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 42px 38px 42px;">

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fff8e8;border-radius:12px;border:1px solid #f5dfaa;">
                      <tr>
                        <td style="padding:17px 18px;">
                          <div style="font-size:13px;line-height:20px;font-weight:800;color:#8a5a00;">
                            Expires in ${expiry}
                          </div>
                          <div style="margin-top:4px;font-size:13px;line-height:20px;color:#725f3d;">
                            Never share this code with anyone. Kora OS will never ask you for your verification code by phone, chat, or social media.
                          </div>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0 0;font-size:13px;line-height:21px;color:#7b8797;">
                      If you did not request this code, no action is required. You can safely ignore this email.
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:27px 20px 8px 20px;">
              <div style="font-size:13px;line-height:20px;font-weight:700;color:#d7dde6;">
                Kora OS
              </div>
              <div style="margin-top:3px;font-size:12px;line-height:19px;color:#8793a6;">
                Run your service business beautifully.
              </div>
              <div style="margin-top:9px;font-size:12px;line-height:19px;color:#f5b82e;">
                koraafric.com
              </div>
              <div style="margin-top:17px;font-size:10px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#657186;">
                A Realtegic product
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

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
