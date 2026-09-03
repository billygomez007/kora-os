import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';

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
    DatabaseModule,
    AuditModule,
    SubscriptionsModule,
    OrganizationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
