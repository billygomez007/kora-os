import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { allowedCorsOrigins } from '../../bootstrap/configure-application.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  assertAllowedBrowserOrigin,
  clearBrowserRefreshCookie,
  isBrowserCookieClient,
  isCookieFirstBrowserClient,
  readRefreshCookie,
  setBrowserRefreshCookie,
} from './browser-refresh-cookie.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { RequestEmailOtpDto } from './dto/request-email-otp.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto.js';
import { EmailOtpService } from './email-otp/email-otp.service.js';
import type { RequestUser } from './interfaces/authenticated-request.interface.js';

// Applies to /email-otp/request and /email-otp/verify below. Per-code
// abuse limits (resend cooldown, per-email/per-IP request caps) are
// additionally enforced inside EmailOtpService itself, driven by
// centralized OTP_* configuration (docs task Phase B) — this decorator
// is a coarser, IP-only backstop consistent with how the rest of the
// auth surface is throttled.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly emailOtpService: EmailOtpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The only entry point into a Kora session — the same request/verify
   * pair is both sign-up and sign-in (docs task Phase C); there is no
   * separate password-style registration endpoint. Response shape is
   * identical whether or not `email` already has an account, and the
   * generated code is never included in the response.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('email-otp/request')
  @HttpCode(HttpStatus.OK)
  async requestEmailOtp(
    @Body() dto: RequestEmailOtpDto,
    @Req() request: RequestWithId,
  ) {
    return this.emailOtpService.requestChallenge({
      email: dto.email,
      ipHash: hashIp(request),
      userAgent: request.headers['user-agent'],
      requestId: request.requestId,
    });
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('email-otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browserClient = isBrowserCookieClient(request);
    if (browserClient) this.assertBrowserOrigin(request);

    let userId: string;
    try {
      ({ userId } = await this.emailOtpService.verifyChallenge({
        challengeId: dto.challengeId,
        code: dto.code,
        requestId: request.requestId,
      }));
    } catch (error) {
      this.logUnexpectedVerifyFailure(
        'challenge_verification',
        request.requestId,
        error,
      );
      throw error;
    }

    try {
      const result = await this.authService.issueSessionForVerifiedUser(
        userId,
        buildMetadata(dto.deviceLabel, request),
      );
      if (browserClient) {
        this.setRefreshCookie(
          response,
          result.refreshToken,
          result.session.expiresAt,
        );
      }
      return this.authResponseForClient(
        result,
        isCookieFirstBrowserClient(request),
      );
    } catch (error) {
      this.logUnexpectedVerifyFailure(
        'session_issuance',
        request.requestId,
        error,
      );
      throw error;
    }
  }

  private logUnexpectedVerifyFailure(
    stage: 'challenge_verification' | 'session_issuance',
    requestId: string,
    error: unknown,
  ): void {
    // Expected invalid/expired codes are already safe 401 responses and do
    // not need noisy logs. Unexpected failures get only an allowlisted name
    // and error code; never message text, OTPs, tokens, or secrets.
    if (error instanceof HttpException && error.getStatus() < 500) return;
    const record =
      error && typeof error === 'object'
        ? (error as Record<string, unknown>)
        : {};
    const name = safeDiagnosticToken(
      error instanceof Error ? error.name : record.name,
    );
    const code = safeDiagnosticToken(record.code);
    this.logger.error(
      `Email OTP verify failed stage=${stage} requestId=${safeDiagnosticToken(requestId)} name=${name} code=${code}`,
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browserClient = isBrowserCookieClient(request);
    if (browserClient) this.assertBrowserOrigin(request);

    const refreshToken = browserClient
      ? readRefreshCookie(request)
      : dto.refreshToken;
    if (!refreshToken) {
      throw new HttpException(
        'Authentication is required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.authService.refresh(
      refreshToken,
      buildMetadata(undefined, request),
    );
    if (browserClient) {
      this.setRefreshCookie(
        response,
        result.refreshToken,
        result.session.expiresAt,
      );
    }
    return this.authResponseForClient(
      result,
      isCookieFirstBrowserClient(request),
    );
  }

  @Public()
  @Post('browser-logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async browserLogout(
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!isBrowserCookieClient(request)) {
      throw new HttpException(
        'Browser authentication is required',
        HttpStatus.FORBIDDEN,
      );
    }

    this.assertBrowserOrigin(request);

    try {
      const refreshToken = readRefreshCookie(request);
      if (refreshToken) {
        await this.authService.logoutByRefreshToken(
          refreshToken,
          buildMetadata(undefined, request),
        );
      }
    } finally {
      this.clearRefreshCookie(response);
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browserClient = isBrowserCookieClient(request);
    if (browserClient) this.assertBrowserOrigin(request);

    await this.authService.logout(
      user.id,
      user.sessionId,
      buildMetadata(undefined, request),
    );
    if (browserClient) this.clearRefreshCookie(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browserClient = isBrowserCookieClient(request);
    if (browserClient) this.assertBrowserOrigin(request);

    await this.authService.logoutAll(
      user.id,
      buildMetadata(undefined, request),
    );
    if (browserClient) this.clearRefreshCookie(response);
  }

  private assertBrowserOrigin(request: RequestWithId): void {
    assertAllowedBrowserOrigin(
      request,
      allowedCorsOrigins(this.config.get<string>('NODE_ENV')),
    );
  }

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
    expiresAt: Date,
  ): void {
    setBrowserRefreshCookie(
      response,
      refreshToken,
      expiresAt,
      this.config.get<string>('NODE_ENV') === 'production',
    );
  }

  private clearRefreshCookie(response: Response): void {
    clearBrowserRefreshCookie(
      response,
      this.config.get<string>('NODE_ENV') === 'production',
    );
  }

  private authResponseForClient(result: AuthResult, cookieFirst: boolean) {
    if (!cookieFirst) return result;

    const { refreshToken: _refreshToken, ...redacted } = result;
    void _refreshToken;
    return redacted;
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    return this.authService.me(user.id);
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: RequestUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithId,
  ) {
    await this.authService.revokeSessionForUser(
      user.id,
      sessionId,
      buildMetadata(undefined, request),
    );
  }
}

/**
 * `ipHash` is a salted hash of the caller's address, never the address
 * itself — safe to persist per docs/SECURITY.md section 19's ban on
 * logging unnecessary raw identifying detail, while still supporting
 * anomaly review.
 */
function hashIp(request: RequestWithId & Request): string {
  return createHash('sha256')
    .update(request.ip ?? 'unknown')
    .digest('hex');
}

function buildMetadata(
  deviceLabel: string | undefined,
  request: RequestWithId & Request,
) {
  return {
    deviceLabel,
    userAgent: request.headers['user-agent'],
    ipHash: hashIp(request),
    requestId: request.requestId,
  };
}

function safeDiagnosticToken(value: unknown): string {
  if (typeof value !== 'string') return 'none';
  const normalized = value.trim().replace(/\s+/g, '_');
  return /^[A-Za-z0-9_.-]{1,80}$/.test(normalized) ? normalized : 'redacted';
}
