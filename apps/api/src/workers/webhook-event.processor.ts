import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { StructuredLoggerService } from '../common/logging/structured-logger.service';
import { ProcessWebhookEventJobPayload } from '../jobs/dto/process-webhook-event-job.dto';
import { PROCESS_WEBHOOK_EVENT_JOB } from '../jobs/job-names';
import { JobsService } from '../jobs/jobs.service';
import { WEBHOOKS_QUEUE } from '../jobs/queues';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class WebhookEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly isTestEnv: boolean;
  private readonly redisUrl: string;
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly webhooksService: WebhooksService,
    private readonly logger: StructuredLoggerService,
  ) {
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';
    this.redisUrl = this.configService.get<string>('BULLMQ_REDIS_URL', 'redis://localhost:6380');
  }

  async onModuleInit() {
    if (!this.jobsService.isAsyncMode()) {
      this.logger.info('webhook_worker_disabled', { reason: 'queue_mode_sync' });
      return;
    }

    if (this.isTestEnv) {
      this.logger.info('webhook_worker_disabled', { reason: 'test_environment' });
      return;
    }

    this.worker = new Worker(WEBHOOKS_QUEUE, async (job: Job) => this.processJob(job), {
      connection: {
        url: this.redisUrl,
      },
    });

    this.worker.on('completed', (job) => {
      this.logger.info('webhook_worker_job_completed', {
        queue: WEBHOOKS_QUEUE,
        jobId: String(job.id ?? 'unknown'),
      });
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error('webhook_worker_job_failed', {
        queue: WEBHOOKS_QUEUE,
        jobId: String(job?.id ?? 'unknown'),
        errorMessage: error.message,
      });
    });

    this.logger.info('webhook_worker_subscribed', { queue: WEBHOOKS_QUEUE });
  }

  async processPayloadForTest(payload: ProcessWebhookEventJobPayload, attempts = 1) {
    await this.webhooksService.processQueuedWebhookEvent(payload, attempts);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processJob(job: Job) {
    if (job.name !== PROCESS_WEBHOOK_EVENT_JOB) {
      this.logger.warn('webhook_worker_unsupported_job', {
        queue: WEBHOOKS_QUEUE,
        jobName: job.name,
        jobId: String(job.id ?? 'unknown'),
      });
      return;
    }

    const payload = job.data as ProcessWebhookEventJobPayload;
    await this.webhooksService.processQueuedWebhookEvent(payload, job.attemptsMade + 1);
  }
}
