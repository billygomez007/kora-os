import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeEmail } from '../../../common/identity/normalize-email.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  AuthProvider,
  OtpChallengeStatus,
  OtpPurpose,
  UserStatus,
} from '../../../generated/prisma/client.js';
import type { EmailOtpChallenge } from '../../../generated/prisma/client.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  EMAIL_OTP_SENDER,
  type EmailOtpSender,
} from './email-otp-sender.interface.js';
import { computeOtpDigest, digestsMatch, generateOtpCode } from './otp-code.util.js';

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const OTP_ERROR_BODY = {
  code: 'OTP_INVALID',
  message: 'This code is invalid or has expired.',
};

export interface RequestOtpInput {
  email: string;
  ipHash?: string;
  userAgent?: string;
  requestId: string;
}

export interface RequestOtpResult {
  challengeId: string;
  expiresAt: Date;
}

export interface VerifyOtpInput {
  challengeId: string;
  code: string;
  requestId: string;
}

export interface VerifyOtpResult {
  userId: string;
  emailNormalized: string;
  isNewUser: boolean;
}

/**
 * The whole passwordless sign-in flow (docs task Phase B/C): one request
 * endpoint, one verify endpoint, no separate password-style registration.
 * A challenge is single-use, short-lived, and rate-limited independently
 * of any one challenge's own attempt counter (see requestChallenge) so
 * requesting a fresh code can never be used to reset accumulated abuse
 * limits for free.
 */
@Injectable()
export class EmailOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_OTP_SENDER) private readonly sender: EmailOtpSender,
    private readonly auditService: AuditService,
  ) {}

  async requestChallenge(input: RequestOtpInput): Promise<RequestOtpResult> {
    const emailNormalized = normalizeEmail(input.email);
    const purpose = OtpPurpose.AUTHENTICATE;

    await this.enforceRequestRateLimits(emailNormalized, input.ipHash);

    // Requesting a new code invalidates whatever active one already
    // exists for this email — a resend, not a second live code.
    const existingActive = await this.prisma.emailOtpChallenge.findFirst({
      where: { emailNormalized, purpose, status: OtpChallengeStatus.ACTIVE },
    });
    if (existingActive) {
      await this.prisma.emailOtpChallenge.update({
        where: { id: existingActive.id },
        data: {
          status: OtpChallengeStatus.INVALIDATED,
          invalidatedAt: new Date(),
        },
      });
    }

    const challengeId = randomUUID();
    const codeLength = this.config.getOrThrow<number>('OTP_CODE_LENGTH');
    const code = generateOtpCode(codeLength);
    const expiryMinutes = this.config.getOrThrow<number>('OTP_EXPIRY_MINUTES');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);
    const maxAttempts = this.config.getOrThrow<number>('OTP_MAX_ATTEMPTS');
    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    const codeDigest = computeOtpDigest({
      pepper,
      challengeId,
      emailNormalized,
      code,
    });

    await this.prisma.emailOtpChallenge.create({
      data: {
        id: challengeId,
        emailNormalized,
        purpose,
        codeDigest,
        maxAttempts,
        expiresAt,
        requestIpHash: input.ipHash,
        requestUserAgent: input.userAgent,
        replacesChallengeId: existingActive?.id,
      },
    });

    const existingUser = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });

    try {
      await this.sender.send({ emailNormalized, code, expiresAt, expiryMinutes });
    } catch {
      // An undelivered challenge must not remain usable: the recipient
      // never received the code, so nobody should be able to verify this
      // challenge id at all — invalidate it the same as a resend would,
      // rather than leaving it ACTIVE and guessable for its full TTL.
      await this.prisma.emailOtpChallenge.updateMany({
        where: { id: challengeId, status: OtpChallengeStatus.ACTIVE },
        data: {
          status: OtpChallengeStatus.INVALIDATED,
          invalidatedAt: new Date(),
        },
      });
      // Sanitized: no SMTP/provider internals, no message body, no code —
      // just that delivery for this challenge failed.
      await this.auditService.record({
        actorUserId: existingUser?.id ?? null,
        action: 'auth.otp_delivery_failed',
        entityType: 'email_otp_challenge',
        entityId: challengeId,
        requestId: input.requestId,
        source: 'auth',
      });
      // This catch block wraps nothing but sender.send() — any error
      // reaching it means delivery failed, so it always fails closed the
      // same way (never leaking which sender or which internal error was
      // involved), rather than trusting every sender implementation to
      // throw exactly EmailDeliveryUnavailableError and falling through
      // to a raw, unsanitized 500 for anything else.
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        message: 'Unable to deliver a sign-in code right now.',
      });
    }

    await this.auditService.record({
      actorUserId: existingUser?.id ?? null,
      action: 'auth.otp_requested',
      entityType: 'email_otp_challenge',
      entityId: challengeId,
      requestId: input.requestId,
      source: 'auth',
    });

    // Identical shape whether or not `existingUser` was found — the
    // caller never learns which happened (docs task Phase C: "Must not
    // reveal account existence").
    return { challengeId, expiresAt };
  }

  /**
   * Verification and consumption happen in one atomic UPDATE guarded by
   * `status = ACTIVE`, so two concurrent verification requests for the
   * same challenge can never both succeed — the loser sees 0 affected
   * rows and is rejected even if it independently computed a matching
   * digest (docs task Phase B: "concurrent verification requests cannot
   * use one code twice").
   */
  async verifyChallenge(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const challenge = await this.prisma.emailOtpChallenge.findUnique({
      where: { id: input.challengeId },
    });
    if (!challenge) {
      throw new UnauthorizedException(OTP_ERROR_BODY);
    }

    if (challenge.status !== OtpChallengeStatus.ACTIVE) {
      await this.recordRejection(challenge, input.requestId, statusToReason(challenge.status));
      throw new UnauthorizedException(OTP_ERROR_BODY);
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.recordRejection(challenge, input.requestId, 'expired');
      throw new UnauthorizedException(OTP_ERROR_BODY);
    }

    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    const expectedDigest = computeOtpDigest({
      pepper,
      challengeId: challenge.id,
      emailNormalized: challenge.emailNormalized,
      code: input.code,
    });
    const codeIsCorrect = digestsMatch(expectedDigest, challenge.codeDigest);

    if (!codeIsCorrect) {
      const locked = await this.recordFailedAttempt(challenge);
      await this.recordRejection(
        challenge,
        input.requestId,
        'incorrect_code',
        locked,
      );
      throw new UnauthorizedException(OTP_ERROR_BODY);
    }

    const consumed = await this.prisma.emailOtpChallenge.updateMany({
      where: { id: challenge.id, status: OtpChallengeStatus.ACTIVE },
      data: { status: OtpChallengeStatus.CONSUMED, consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      // Another request already consumed, invalidated, or locked this
      // challenge between our reads above and this UPDATE.
      await this.recordRejection(challenge, input.requestId, 'lost_race');
      throw new UnauthorizedException(OTP_ERROR_BODY);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { emailNormalized: challenge.emailNormalized },
    });
    const isNewUser = !existingUser;
    const user = existingUser
      ? existingUser.emailVerifiedAt
        ? existingUser
        : await this.prisma.user.update({
            where: { id: existingUser.id },
            data: { emailVerifiedAt: new Date() },
          })
      : await this.prisma.user.create({
          data: {
            emailNormalized: challenge.emailNormalized,
            displayName: challenge.emailNormalized.split('@')[0] ?? 'Kora user',
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
          },
        });

    await this.prisma.authIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.EMAIL_OTP,
          providerSubject: challenge.emailNormalized,
        },
      },
      update: { userId: user.id, lastUsedAt: new Date() },
      create: {
        userId: user.id,
        provider: AuthProvider.EMAIL_OTP,
        providerSubject: challenge.emailNormalized,
        lastUsedAt: new Date(),
      },
    });

    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.otp_verified',
      entityType: 'email_otp_challenge',
      entityId: challenge.id,
      requestId: input.requestId,
      source: 'auth',
      metadata: { isNewUser },
    });

    return {
      userId: user.id,
      emailNormalized: user.emailNormalized ?? challenge.emailNormalized,
      isNewUser,
    };
  }

  /**
   * Independent of any single challenge's attempt counter: a resend
   * cooldown, plus per-email and per-IP counts over a rolling hour. This
   * is what actually stops "just request a new code" from resetting
   * accumulated abuse limits — a new challenge always starts at
   * `attemptCount = 0`, but obtaining one at all is bounded here.
   */
  private async enforceRequestRateLimits(
    emailNormalized: string,
    ipHash: string | undefined,
  ): Promise<void> {
    const cooldownSeconds = this.config.getOrThrow<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
    );
    const mostRecent = await this.prisma.emailOtpChallenge.findFirst({
      where: { emailNormalized, purpose: OtpPurpose.AUTHENTICATE },
      orderBy: { createdAt: 'desc' },
    });
    if (
      mostRecent &&
      Date.now() - mostRecent.createdAt.getTime() < cooldownSeconds * 1000
    ) {
      throw rateLimitedException();
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const emailLimit = this.config.getOrThrow<number>(
      'OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR',
    );
    const emailCount = await this.prisma.emailOtpChallenge.count({
      where: {
        emailNormalized,
        purpose: OtpPurpose.AUTHENTICATE,
        createdAt: { gte: windowStart },
      },
    });
    if (emailCount >= emailLimit) {
      throw rateLimitedException();
    }

    if (ipHash) {
      const ipLimit = this.config.getOrThrow<number>(
        'OTP_MAX_REQUESTS_PER_IP_PER_HOUR',
      );
      const ipCount = await this.prisma.emailOtpChallenge.count({
        where: { requestIpHash: ipHash, createdAt: { gte: windowStart } },
      });
      if (ipCount >= ipLimit) {
        throw rateLimitedException();
      }
    }
  }

  /** Returns whether this attempt caused the challenge to become locked. */
  private async recordFailedAttempt(
    challenge: EmailOtpChallenge,
  ): Promise<boolean> {
    const updated = await this.prisma.emailOtpChallenge.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });
    if (updated.attemptCount >= updated.maxAttempts) {
      await this.prisma.emailOtpChallenge.updateMany({
        where: { id: challenge.id, status: OtpChallengeStatus.ACTIVE },
        data: { status: OtpChallengeStatus.LOCKED },
      });
      return true;
    }
    return false;
  }

  private async recordRejection(
    challenge: { id: string; emailNormalized: string },
    requestId: string,
    reason: string,
    locked = false,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: challenge.emailNormalized },
    });
    await this.auditService.record({
      actorUserId: user?.id ?? null,
      action: 'auth.otp_rejected',
      entityType: 'email_otp_challenge',
      entityId: challenge.id,
      requestId,
      source: 'auth',
      metadata: { reason, locked },
    });
  }
}

function statusToReason(status: OtpChallengeStatus): string {
  switch (status) {
    case OtpChallengeStatus.CONSUMED:
      return 'already_consumed';
    case OtpChallengeStatus.INVALIDATED:
      return 'invalidated';
    case OtpChallengeStatus.LOCKED:
      return 'locked';
    default:
      return 'inactive';
  }
}

function rateLimitedException(): HttpException {
  return new HttpException(
    {
      code: 'OTP_RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      retryable: true,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
