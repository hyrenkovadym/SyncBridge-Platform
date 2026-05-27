import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';

import { EXECUTE_SYNC_RUN_JOB } from './job-names';
import { ExecuteSyncRunJobPayload } from './dto/execute-sync-run-job.dto';
import { SYNC_RUNS_QUEUE } from './queues';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly queueMode: 'sync' | 'async';
  private readonly defaultAttempts: number;
  private readonly backoffMs: number;
  private readonly redisUrl: string;
  private readonly isTestEnv: boolean;
  private readonly queue?: Queue;

  constructor(private readonly configService: ConfigService) {
    this.queueMode = this.getQueueModeFromConfig();
    this.defaultAttempts = this.getIntConfig('BULLMQ_DEFAULT_ATTEMPTS', 3);
    this.backoffMs = this.getIntConfig('BULLMQ_BACKOFF_MS', 5000);
    this.redisUrl = this.configService.get<string>('BULLMQ_REDIS_URL', 'redis://localhost:6380');
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';

    if (this.shouldUseRedisQueueInfrastructure()) {
      this.queue = new Queue(SYNC_RUNS_QUEUE, {
        connection: {
          url: this.redisUrl,
        },
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
        },
      });
    }
  }

  isAsyncMode() {
    return this.queueMode === 'async';
  }

  getDefaultAttempts() {
    return this.defaultAttempts;
  }

  getBackoffMs() {
    return this.backoffMs;
  }

  async enqueueExecuteSyncRunJob(payload: ExecuteSyncRunJobPayload) {
    if (!this.isAsyncMode()) {
      throw new Error('Queue mode is sync. Async enqueue is not enabled.');
    }

    const jobId = payload.backgroundJobId;
    if (!this.queue) {
      this.logger.warn(
        'Async queue fallback is active without Redis queue infrastructure (expected in tests).',
      );
      return { jobId };
    }

    const job = await this.queue.add(EXECUTE_SYNC_RUN_JOB, payload, {
      jobId,
      attempts: this.defaultAttempts,
      backoff: {
        type: 'fixed',
        delay: this.backoffMs,
      },
    });

    return { jobId: String(job.id ?? jobId) };
  }

  async getBullMqJob(jobId: string): Promise<Job | null> {
    if (!this.queue) {
      return null;
    }

    const job = await this.queue.getJob(jobId);
    return job ?? null;
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
  }

  private shouldUseRedisQueueInfrastructure() {
    return this.isAsyncMode() && !this.isTestEnv;
  }

  private getQueueModeFromConfig(): 'sync' | 'async' {
    const queueModeRaw = this.configService.get<string>('QUEUE_MODE', 'sync').toLowerCase();
    return queueModeRaw === 'async' ? 'async' : 'sync';
  }

  private getIntConfig(key: string, fallback: number) {
    const raw = this.configService.get<string>(key, String(fallback));
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return fallback;
    }
    return parsed;
  }
}
