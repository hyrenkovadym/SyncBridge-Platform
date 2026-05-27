import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '../config/env.validation';
import { JobsModule } from '../jobs/jobs.module';
import { SyncRunsModule } from '../sync-runs/sync-runs.module';
import { SyncRunProcessor } from './sync-run.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    JobsModule,
    SyncRunsModule,
  ],
  providers: [SyncRunProcessor],
})
export class WorkersModule {}
