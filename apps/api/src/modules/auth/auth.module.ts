import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailOtpModule } from './email-otp/email-otp.module.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { TokenService } from './token.service.js';

@Module({
  // Secret and expiry are supplied per call from ConfigService (see
  // TokenService) rather than fixed here, so JwtModule is registered with
  // no static options.
  imports: [JwtModule.register({}), AuditModule, EmailOtpModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard],
  exports: [AuthService, TokenService, JwtAuthGuard, EmailOtpModule],
})
export class AuthModule {}
