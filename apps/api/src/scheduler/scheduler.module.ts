import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { SyncRunsModule } from '../sync-runs/sync-runs.module';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [PipelinesModule, SyncRunsModule, AuditModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
