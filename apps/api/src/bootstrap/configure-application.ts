import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ApiResponseInterceptor } from '../common/http/api-response.interceptor.js';
import {
  cloudflareForwardedForMiddleware,
  createTrustedProxyMatcher,
} from '../common/network/cloudflare-client-ip.js';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware.js';

const PRODUCTION_CORS_ORIGINS = [
  'https://koraafric.com',
  'https://www.koraafric.com',
] as const;

const DEVELOPMENT_CORS_ORIGINS = [
  'http://localhost:3001',
  ...PRODUCTION_CORS_ORIGINS,
] as const;

/** Keep local development convenient without allowing localhost in production. */
export function allowedCorsOrigins(nodeEnv: string | undefined): string[] {
  return nodeEnv === 'production'
    ? [...PRODUCTION_CORS_ORIGINS]
    : [...DEVELOPMENT_CORS_ORIGINS];
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const apiPrefix = config.getOrThrow<string>('API_PREFIX');
  const trustedCloudflareProxy = createTrustedProxyMatcher(
    config.get<string>('CLOUDFLARE_TRUSTED_PROXY_CIDRS'),
  );

  app.use(helmet());
  app.getHttpAdapter().getInstance().set('trust proxy', trustedCloudflareProxy);

  app.enableCors({
    origin: allowedCorsOrigins(config.get<string>('NODE_ENV')),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
    ],
  });

  app.use(cloudflareForwardedForMiddleware(trustedCloudflareProxy));
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.enableShutdownHooks();
}
