import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { ExecuteSyncRunJobPayload } from '../jobs/dto/execute-sync-run-job.dto';
import { EXECUTE_SYNC_RUN_JOB } from '../jobs/job-names';
import { JobsService } from '../jobs/jobs.service';
import { SYNC_RUNS_QUEUE } from '../jobs/queues';
import { SyncRunsService } from '../sync-runs/sync-runs.service';

@Injectable()
export class SyncRunProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncRunProcessor.name);
  private readonly isTestEnv: boolean;
  private readonly redisUrl: string;
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly syncRunsService: SyncRunsService,
  ) {
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';
    this.redisUrl = this.configService.get<string>('BULLMQ_REDIS_URL', 'redis://localhost:6380');
  }

  async onModuleInit() {
    if (!this.jobsService.isAsyncMode()) {
      this.logger.log('Queue mode is sync. Worker is disabled.');
      return;
    }

    if (this.isTestEnv) {
      this.logger.log('Test environment detected. Redis worker bootstrap is skipped.');
      return;
    }

    this.worker = new Worker(
      SYNC_RUNS_QUEUE,
      async (job: Job) => this.processJob(job),
      {
        connection: {
          url: this.redisUrl,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Completed job ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Failed job ${job?.id ?? 'unknown'}: ${error.message}`);
    });

    this.logger.log(`Worker subscribed to queue "${SYNC_RUNS_QUEUE}"`);
  }

  async processPayloadForTest(payload: ExecuteSyncRunJobPayload, attempts = 1) {
    await this.syncRunsService.processQueuedSyncRun(payload, attempts);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processJob(job: Job) {
    if (job.name !== EXECUTE_SYNC_RUN_JOB) {
      this.logger.warn(`Ignoring unsupported job name "${job.name}"`);
      return;
    }

    const payload = job.data as ExecuteSyncRunJobPayload;
    await this.syncRunsService.processQueuedSyncRun(payload, job.attemptsMade + 1);
  }
}
