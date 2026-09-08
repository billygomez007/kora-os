import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface StaffInvitationEmailParams {
  email: string;
  organizationName: string;
  roleName: string;
  branchName?: string | null;
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class StaffInvitationEmailService {
  private readonly logger = new Logger(StaffInvitationEmailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string | null;
  private readonly webBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const mode = config.get<string>('EMAIL_DELIVERY_MODE');

    this.webBaseUrl = (
      config.get<string>('KORA_WEB_URL') ??
      (config.get<string>('NODE_ENV') === 'production'
        ? 'https://koraafric.com'
        : 'http://localhost:3001')
    ).replace(/\/+$/, '');

    if (mode !== 'smtp') {
      this.transporter = null;
      this.fromAddress = null;
      return;
    }

    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');

    this.fromAddress = config.getOrThrow<string>('EMAIL_FROM');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: config.getOrThrow<boolean>('SMTP_SECURE'),
      auth: user && password ? { user, pass: password } : undefined,
      logger: false,
      debug: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(params: StaffInvitationEmailParams): Promise<void> {
    if (!this.transporter || !this.fromAddress) {
      this.logger.error('Staff invitation email delivery is not configured');
      throw new ServiceUnavailableException(
        'Kora could not send the staff invitation email. Please try again later.',
      );
    }

    const inviteUrl = `${this.webBaseUrl}/invite/${encodeURIComponent(params.rawToken)}`;

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.email,
        subject: `${params.organizationName} invited you to Kora OS`,
        text: buildText(params, inviteUrl),
        html: buildHtml(params, inviteUrl),
      });
    } catch (error) {
      this.logger.error(
        `Staff invitation email delivery failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      throw new ServiceUnavailableException(
        'Kora created the invitation but could not deliver the email. Please try again.',
      );
    }
  }
}

function buildText(
  params: StaffInvitationEmailParams,
  inviteUrl: string,
): string {
  const branch = params.branchName
    ? `Branch: ${params.branchName}`
    : 'Branch: All permitted locations';

  return [
    'KORA OS',
    '',
    `You have been invited to join ${params.organizationName}.`,
    '',
    `Role: ${params.roleName}`,
    branch,
    '',
    'Accept your invitation:',
    inviteUrl,
    '',
    `This invitation expires on ${params.expiresAt.toLocaleString('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    })} UTC.`,
    '',
    'If you were not expecting this invitation, you can safely ignore this email.',
    '',
    'Kora OS',
    'Run your business beautifully.',
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildHtml(
  params: StaffInvitationEmailParams,
  inviteUrl: string,
): string {
  const organization = escapeHtml(params.organizationName);
  const role = escapeHtml(params.roleName);
  const branch = params.branchName
    ? escapeHtml(params.branchName)
    : 'All permitted locations';
  const safeUrl = escapeHtml(inviteUrl);
  const expiry = escapeHtml(
    params.expiresAt.toLocaleString('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kora OS Staff Invitation</title>
</head>
<body style="margin:0;padding:0;background:#090b0f;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090b0f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#11141a;border:1px solid #272b33;border-radius:24px;overflow:hidden;">
          <tr>
            <td style="padding:34px 38px 18px;">
              <div style="font-size:13px;font-weight:800;letter-spacing:3px;color:#d9ad55;">KORA OS</div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 38px 38px;">
              <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#1d1a12;color:#e3ba67;font-size:11px;font-weight:800;letter-spacing:1.5px;">TEAM INVITATION</div>
              <h1 style="font-size:34px;line-height:1.12;margin:22px 0 14px;color:#ffffff;">You have been invited to join ${organization}.</h1>
              <p style="font-size:16px;line-height:1.7;color:#aeb4bf;margin:0 0 28px;">
                Your team is waiting for you on Kora OS. Accept this invitation to securely join the workspace.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0c0f14;border:1px solid #242933;border-radius:16px;margin:0 0 30px;">
                <tr>
                  <td style="padding:20px 22px;border-bottom:1px solid #242933;">
                    <div style="font-size:11px;letter-spacing:1.4px;color:#747d8b;margin-bottom:6px;">BUSINESS</div>
                    <div style="font-size:16px;font-weight:700;color:#ffffff;">${organization}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 22px;border-bottom:1px solid #242933;">
                    <div style="font-size:11px;letter-spacing:1.4px;color:#747d8b;margin-bottom:6px;">ROLE</div>
                    <div style="font-size:16px;font-weight:700;color:#ffffff;">${role}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:11px;letter-spacing:1.4px;color:#747d8b;margin-bottom:6px;">BRANCH</div>
                    <div style="font-size:16px;font-weight:700;color:#ffffff;">${branch}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="border-radius:12px;background:#d6aa52;">
                    <a href="${safeUrl}" style="display:inline-block;padding:15px 26px;color:#090b0f;text-decoration:none;font-size:15px;font-weight:800;">
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;line-height:1.6;color:#777f8c;margin:28px 0 0;">
                This invitation expires ${expiry} UTC. If you were not expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 38px;border-top:1px solid #242933;color:#686f7b;font-size:12px;">
              Kora OS · Run your business beautifully.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
