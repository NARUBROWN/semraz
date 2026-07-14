import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { installServerLogBuffer } from './feedback/server-log-buffer';

async function bootstrap() {
  installServerLogBuffer();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Feedback screenshots are posted as base64 data URLs, so the default 100kb JSON limit is too small.
  app.useBodyParser('json', { limit: '15mb' });
  app.enableCors({
    origin: [
      'https://semraz.dev',
      'https://www.semraz.dev',
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ],
  });
  await app.listen(process.env.PORT ?? process.env.APP_PORT ?? 3000);
}
bootstrap();
