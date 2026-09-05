import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { DomainEventsModule } from './common/events/domain-events.module.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { AvailabilityModule } from './modules/availability/availability.module.js';
import { CashModule } from './modules/cash/cash.module.js';
import { CheckoutsModule } from './modules/checkouts/checkouts.module.js';
import { CommissionsModule } from './modules/commissions/commissions.module.js';
import { CorrectionsModule } from './modules/corrections/corrections.module.js';
import { CustomerProfileModule } from './modules/customer-profile/customer-profile.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { FavoritesModule } from './modules/favorites/favorites.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { ReceiptsModule } from './modules/receipts/receipts.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SchedulingModule } from './modules/scheduling/scheduling.module.js';
import { ServiceSessionsModule } from './modules/service-sessions/service-sessions.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { StaffInvitationsModule } from './modules/staff-invitations/staff-invitations.module.js';
import { SubscriptionDetailModule } from './modules/subscriptions/subscription-detail.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';

// The monorepo keeps a single local `.env` at the repository root rather
// than one per package. Resolving it relative to this file (instead of
// relying on the process working directory) makes local development work
// the same way regardless of where a script is launched from. In
// production no such file exists on disk, so this is a safe no-op and real
// process environment variables are used instead.
const repositoryRootEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.env',
);

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      envFilePath: repositoryRootEnvPath,
      validate: validateEnvironment,
    }),
    // Lenient global default (every route); auth routes additionally
    // apply a stricter per-route @Throttle() limit (see AuthController).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    DomainEventsModule,
    AuditModule,
    SubscriptionsModule,
    SubscriptionDetailModule,
    OrganizationsModule,
    StaffInvitationsModule,
    StaffModule,
    DiscoveryModule,
    ServicesModule,
    SchedulingModule,
    AvailabilityModule,
    CustomerProfileModule,
    FavoritesModule,
    WorkspacesModule,
    AppointmentsModule,
    ServiceSessionsModule,
    QueueModule,
    CheckoutsModule,
    CommissionsModule,
    ReceiptsModule,
    TransactionsModule,
    CashModule,
    PaymentsModule,
    CorrectionsModule,
    ReportsModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global: every route requires authentication unless explicitly
    // marked @Public() (see modules/auth/decorators/public.decorator.ts).
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
