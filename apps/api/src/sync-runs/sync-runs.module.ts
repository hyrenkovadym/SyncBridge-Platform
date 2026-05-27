import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { TransformationsModule } from '../transformations/transformations.module';
import { SyncRunsController } from './sync-runs.controller';
import { SyncRunsService } from './sync-runs.service';

@Module({
  imports: [PipelinesModule, AuditModule, TransformationsModule, JobsModule],
  controllers: [SyncRunsController],
  providers: [SyncRunsService],
})
export class SyncRunsModule {}
