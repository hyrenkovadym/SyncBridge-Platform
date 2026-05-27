import { Module } from '@nestjs/common';

import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobStatusService } from './job-status.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobStatusService],
  exports: [JobsService, JobStatusService],
})
export class JobsModule {}
