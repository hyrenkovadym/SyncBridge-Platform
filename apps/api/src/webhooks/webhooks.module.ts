import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { TransformationsModule } from '../transformations/transformations.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuditModule, JobsModule, TransformationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
