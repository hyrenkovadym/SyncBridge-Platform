import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { ProcessWebhookEventJobPayload } from '../jobs/dto/process-webhook-event-job.dto';
import { PROCESS_WEBHOOK_EVENT_JOB } from '../jobs/job-names';
import { JobsService } from '../jobs/jobs.service';
import { WEBHOOKS_QUEUE } from '../jobs/queues';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class WebhookEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookEventProcessor.name);
  private readonly isTestEnv: boolean;
  private readonly redisUrl: string;
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly webhooksService: WebhooksService,
  ) {
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';
    this.redisUrl = this.configService.get<string>('BULLMQ_REDIS_URL', 'redis://localhost:6380');
  }

  async onModuleInit() {
    if (!this.jobsService.isAsyncMode()) {
      this.logger.log('Queue mode is sync. Webhook worker is disabled.');
      return;
    }

    if (this.isTestEnv) {
      this.logger.log('Test environment detected. Webhook Redis worker bootstrap is skipped.');
      return;
    }

    this.worker = new Worker(WEBHOOKS_QUEUE, async (job: Job) => this.processJob(job), {
      connection: {
        url: this.redisUrl,
      },
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Completed webhook job ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Failed webhook job ${job?.id ?? 'unknown'}: ${error.message}`);
    });

    this.logger.log(`Worker subscribed to queue "${WEBHOOKS_QUEUE}"`);
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
      this.logger.warn(`Ignoring unsupported webhook job name "${job.name}"`);
      return;
    }

    const payload = job.data as ProcessWebhookEventJobPayload;
    await this.webhooksService.processQueuedWebhookEvent(payload, job.attemptsMade + 1);
  }
}
