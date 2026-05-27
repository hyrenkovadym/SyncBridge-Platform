import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '../config/env.validation';
import { JobsModule } from '../jobs/jobs.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SyncRunsModule } from '../sync-runs/sync-runs.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SyncRunProcessor } from './sync-run.processor';
import { WebhookEventProcessor } from './webhook-event.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    JobsModule,
    SchedulerModule,
    SyncRunsModule,
    WebhooksModule,
  ],
  providers: [SyncRunProcessor, WebhookEventProcessor],
})
export class WorkersModule {}
