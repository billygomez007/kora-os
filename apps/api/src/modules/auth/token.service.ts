import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AccessTokenClaims {
  /** Global user ID. */
  sub: string;
  /** Session ID — lets the guard reject a token whose session was revoked. */
  sid: string;
}

export interface GeneratedRefreshToken {
  /** Returned to the client once; never persisted. */
  raw: string;
  /** SHA-256(raw + pepper) — refresh tokens are already high-entropy random
   * values, not human-guessable secrets, so a fast hash is appropriate; a
   * slow memory-hard hash (the kind a password would need — Kora has
   * none, see docs/SECURITY.md section 6) would add latency for no
   * security benefit here. */
  hash: string;
}

/**
 * Short-lived signed access tokens plus cryptographically random opaque
 * refresh tokens. Access tokens carry only stable identity references
 * (`sub`, `sid`) — never roles, permissions, or other mutable
 * authorization claims, which are always re-resolved from the database on
 * each request (see TenantContextService).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // JWT_ACCESS_TTL is validated at startup (environment.ts) against
      // /^\d+[smhd]$/, which is exactly the shape `jsonwebtoken`'s
      // `expiresIn` accepts at runtime — the cast only works around its
      // overly narrow branded `StringValue` compile-time type.
      expiresIn: this.config.getOrThrow<string>(
        'JWT_ACCESS_TTL',
      ) as unknown as number,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwtService.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  generateRefreshToken(): GeneratedRefreshToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    const pepper = this.config.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    return createHash('sha256').update(`${pepper}:${raw}`).digest('hex');
  }

  refreshTokenTtlMs(): number {
    const days = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    return days * 24 * 60 * 60 * 1000;
  }
}
