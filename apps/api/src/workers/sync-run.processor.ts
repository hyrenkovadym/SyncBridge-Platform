import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

import { StructuredLoggerService } from '../common/logging/structured-logger.service';
import { ExecuteSyncRunJobPayload } from '../jobs/dto/execute-sync-run-job.dto';
import { EXECUTE_SYNC_RUN_JOB } from '../jobs/job-names';
import { JobsService } from '../jobs/jobs.service';
import { SYNC_RUNS_QUEUE } from '../jobs/queues';
import { SyncRunsService } from '../sync-runs/sync-runs.service';

@Injectable()
export class SyncRunProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly isTestEnv: boolean;
  private readonly redisUrl: string;
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly syncRunsService: SyncRunsService,
    private readonly logger: StructuredLoggerService,
  ) {
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';
    this.redisUrl = this.configService.get<string>('BULLMQ_REDIS_URL', 'redis://localhost:6380');
  }

  async onModuleInit() {
    if (!this.jobsService.isAsyncMode()) {
      this.logger.info('sync_run_worker_disabled', { reason: 'queue_mode_sync' });
      return;
    }

    if (this.isTestEnv) {
      this.logger.info('sync_run_worker_disabled', { reason: 'test_environment' });
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
      this.logger.info('sync_run_worker_job_completed', {
        queue: SYNC_RUNS_QUEUE,
        jobId: String(job.id ?? 'unknown'),
      });
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error('sync_run_worker_job_failed', {
        queue: SYNC_RUNS_QUEUE,
        jobId: String(job?.id ?? 'unknown'),
        errorMessage: error.message,
      });
    });

    this.logger.info('sync_run_worker_subscribed', { queue: SYNC_RUNS_QUEUE });
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
      this.logger.warn('sync_run_worker_unsupported_job', {
        queue: SYNC_RUNS_QUEUE,
        jobName: job.name,
        jobId: String(job.id ?? 'unknown'),
      });
      return;
    }

    const payload = job.data as ExecuteSyncRunJobPayload;
    await this.syncRunsService.processQueuedSyncRun(payload, job.attemptsMade + 1);
  }
}
