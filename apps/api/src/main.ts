import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApplication } from './bootstrap/configure-application.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');

  await app.listen(port, '0.0.0.0');
}
await bootstrap();
