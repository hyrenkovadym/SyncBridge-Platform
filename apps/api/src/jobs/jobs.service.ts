import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';

import { StructuredLoggerService } from '../common/logging/structured-logger.service';
import { EXECUTE_SYNC_RUN_JOB, PROCESS_WEBHOOK_EVENT_JOB } from './job-names';
import { ExecuteSyncRunJobPayload } from './dto/execute-sync-run-job.dto';
import { ProcessWebhookEventJobPayload } from './dto/process-webhook-event-job.dto';
import { SYNC_RUNS_QUEUE, WEBHOOKS_QUEUE } from './queues';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly queueMode: 'sync' | 'async';
  private readonly defaultAttempts: number;
  private readonly backoffMs: number;
  private readonly redisUrl: string;
  private readonly isTestEnv: boolean;
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: StructuredLoggerService,
  ) {
    this.queueMode = this.getQueueModeFromConfig();
    this.defaultAttempts = this.getIntConfig('BULLMQ_DEFAULT_ATTEMPTS', 3);
    this.backoffMs = this.getIntConfig('BULLMQ_BACKOFF_MS', 5000);
    this.redisUrl = this.configService.get<string>('BULLMQ_REDIS_URL', 'redis://localhost:6380');
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';

    if (this.shouldUseRedisQueueInfrastructure()) {
      this.queues.set(SYNC_RUNS_QUEUE, this.createQueue(SYNC_RUNS_QUEUE));
      this.queues.set(WEBHOOKS_QUEUE, this.createQueue(WEBHOOKS_QUEUE));
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
    return this.enqueueJob(SYNC_RUNS_QUEUE, EXECUTE_SYNC_RUN_JOB, payload, payload.backgroundJobId);
  }

  async enqueueProcessWebhookEventJob(payload: ProcessWebhookEventJobPayload) {
    return this.enqueueJob(
      WEBHOOKS_QUEUE,
      PROCESS_WEBHOOK_EVENT_JOB,
      payload,
      payload.backgroundJobId,
    );
  }

  async getBullMqJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }

    const job = await queue.getJob(jobId);
    return job ?? null;
  }

  async checkRedisHealth() {
    if (!this.isAsyncMode()) {
      return {
        status: 'skipped',
        reason: 'queue_mode_sync',
      };
    }

    const queue = this.queues.get(SYNC_RUNS_QUEUE) ?? this.queues.get(WEBHOOKS_QUEUE);
    if (!queue) {
      return {
        status: 'unknown',
        reason: 'queue_not_initialized',
      };
    }

    try {
      const client = await queue.client;
      const pingClient = client as { ping?: () => Promise<string>; call?: (cmd: string) => Promise<string> };
      const pong = pingClient.ping
        ? await pingClient.ping()
        : pingClient.call
          ? await pingClient.call('PING')
          : 'UNKNOWN';
      return {
        status: pong === 'PONG' ? 'up' : 'degraded',
      };
    } catch {
      return {
        status: 'down',
      };
    }
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  private shouldUseRedisQueueInfrastructure() {
    return this.isAsyncMode() && !this.isTestEnv;
  }

  private createQueue(queueName: string) {
    return new Queue(queueName, {
      connection: {
        url: this.redisUrl,
      },
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  private async enqueueJob(queueName: string, jobName: string, payload: unknown, jobId: string) {
    if (!this.isAsyncMode()) {
      throw new Error('Queue mode is sync. Async enqueue is not enabled.');
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      this.logger.warn('queue_enqueue_fallback', {
        queue: queueName,
        mode: this.queueMode,
      });
      return { jobId };
    }

    const job = await queue.add(jobName, payload, {
      jobId,
      attempts: this.defaultAttempts,
      backoff: {
        type: 'fixed',
        delay: this.backoffMs,
      },
    });

    this.logger.info('queue_job_enqueued', {
      queue: queueName,
      jobName,
      jobId: String(job.id ?? jobId),
      attempts: this.defaultAttempts,
      backoffMs: this.backoffMs,
    });

    return { jobId: String(job.id ?? jobId) };
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
