import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkersModule } from './workers/workers.module';

async function bootstrap() {
  const logger = new Logger('SyncBridgeWorker');
  const app = await NestFactory.createApplicationContext(WorkersModule);

  logger.log('Background worker started');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Shutting down worker context...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap();
