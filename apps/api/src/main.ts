import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { StructuredLoggerService } from './common/logging/structured-logger.service';

async function bootstrap() {
  process.env.SYNCBRIDGE_PROCESS_ROLE = process.env.SYNCBRIDGE_PROCESS_ROLE ?? 'api';
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = app.get(StructuredLoggerService);

  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3001');
  const corsOrigins = parseCorsOrigins(corsOrigin);

  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

  if (configService.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SyncBridge Platform API')
      .setDescription('API/Data Integration & Automation Platform')
      .setVersion('1.0.0-phase7')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(configService.get<string>('PORT', '4100'));
  await app.listen(port);
  logger.info('api_started', {
    port,
    queueMode: configService.get<string>('QUEUE_MODE', 'sync'),
    schedulerEnabled: configService.get<string>('SCHEDULER_ENABLED', 'false') === 'true',
    processRole: configService.get<string>('SYNCBRIDGE_PROCESS_ROLE', 'api'),
  });
}

bootstrap();

function parseCorsOrigins(corsOriginRaw: string) {
  const origins = corsOriginRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must include at least one origin');
  }

  for (const origin of origins) {
    if (origin === '*') {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin "${origin}"`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported CORS origin protocol in "${origin}"`);
    }
  }

  return origins;
}
