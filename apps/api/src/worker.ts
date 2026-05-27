import { NestFactory } from '@nestjs/core';

import { WorkersModule } from './workers/workers.module';

async function bootstrap() {
  process.env.SYNCBRIDGE_PROCESS_ROLE = 'worker';
  const app = await NestFactory.createApplicationContext(WorkersModule);

  logWorkerEvent('worker_started', { processRole: 'worker' });

  const shutdown = async (signal: string) => {
    logWorkerEvent('worker_shutdown_requested', { signal });
    await app.close();
    logWorkerEvent('worker_shutdown_completed', { signal });
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

function logWorkerEvent(event: string, metadata?: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event,
      ...metadata,
    }),
  );
}
