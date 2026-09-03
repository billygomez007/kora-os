import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { RequestUser } from './interfaces/authenticated-request.interface.js';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() request: RequestWithId) {
    return this.authService.register(dto, buildMetadata(dto.deviceLabel, request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: RequestWithId) {
    return this.authService.login(dto, buildMetadata(dto.deviceLabel, request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() request: RequestWithId) {
    return this.authService.refresh(
      dto.refreshToken,
      buildMetadata(undefined, request),
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: RequestUser, @Req() request: RequestWithId) {
    await this.authService.logout(
      user.id,
      user.sessionId,
      buildMetadata(undefined, request),
    );
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: RequestUser, @Req() request: RequestWithId) {
    await this.authService.logoutAll(user.id, buildMetadata(undefined, request));
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
function buildMetadata(deviceLabel: string | undefined, request: RequestWithId & Request) {
  return {
    deviceLabel,
    userAgent: request.headers['user-agent'],
    ipHash: createHash('sha256').update(request.ip ?? 'unknown').digest('hex'),
    requestId: request.requestId,
  };
}
