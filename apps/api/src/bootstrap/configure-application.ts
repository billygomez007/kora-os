import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ApiResponseInterceptor } from '../common/http/api-response.interceptor.js';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware.js';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const apiPrefix = config.getOrThrow<string>('API_PREFIX');

  app.use(helmet());

  app.enableCors({
    origin: [
      'http://localhost:3001',
      'https://koraafric.com',
      'https://www.koraafric.com',
    ],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
    ],
  });

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
