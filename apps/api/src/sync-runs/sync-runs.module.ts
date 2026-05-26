import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { SyncRunsController } from './sync-runs.controller';
import { SyncRunsService } from './sync-runs.service';

@Module({
  imports: [PipelinesModule, AuditModule],
  controllers: [SyncRunsController],
  providers: [SyncRunsService],
})
export class SyncRunsModule {}
