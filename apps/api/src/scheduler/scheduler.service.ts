import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineStatus, Prisma, SyncRunTriggerType, UserRole } from '@prisma/client';

import { AuditActor, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StructuredLoggerService } from '../common/logging/structured-logger.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncRunsService } from '../sync-runs/sync-runs.service';
import { computeNextRunAt, validateCronExpression, validateTimezone } from './cron-utils';
import { UpdatePipelineScheduleDto } from './dto/update-pipeline-schedule.dto';

type PollSummary = {
  duePipelines: number;
  enqueued: number;
  skipped: number;
};

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly schedulerEnabled: boolean;
  private readonly pollIntervalSeconds: number;
  private readonly lockTtlSeconds: number;
  private readonly processRole: string;
  private readonly isTestEnv: boolean;
  private pollTimer?: NodeJS.Timeout;
  private pollInProgress = false;
  private lockUntil = 0;
  private lastPollAt: Date | null = null;
  private lastPollDurationMs: number | null = null;
  private lastDuePipelines = 0;
  private lastEnqueued = 0;
  private lastSkipped = 0;
  private lastError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelinesService: PipelinesService,
    private readonly syncRunsService: SyncRunsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly structuredLogger: StructuredLoggerService,
  ) {
    this.schedulerEnabled = this.configService.get<string>('SCHEDULER_ENABLED', 'false') === 'true';
    this.pollIntervalSeconds = this.getIntConfig('SCHEDULER_POLL_INTERVAL_SECONDS', 30, 1);
    this.lockTtlSeconds = this.getIntConfig('SCHEDULER_LOCK_TTL_SECONDS', 60, 1);
    this.processRole = this.configService.get<string>('SYNCBRIDGE_PROCESS_ROLE', 'api');
    this.isTestEnv = this.configService.get<string>('NODE_ENV', 'development') === 'test';
  }

  onModuleInit() {
    if (!this.shouldRunPolling()) {
      this.logger.log('Scheduler poller is disabled.');
      return;
    }

    this.logger.log(
      `Scheduler poller started in role "${this.processRole}" with interval ${this.pollIntervalSeconds}s.`,
    );

    this.pollTimer = setInterval(() => {
      void this.runPollingCycle();
    }, this.pollIntervalSeconds * 1000);

    void this.runPollingCycle();
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  async getPipelineSchedule(pipelineId: string, user: AuthenticatedUser) {
    const pipeline = await this.pipelinesService.findOne(pipelineId, user);
    return this.toScheduleResponse(pipeline);
  }

  async updatePipelineSchedule(
    pipelineId: string,
    dto: UpdatePipelineScheduleDto,
    user: AuthenticatedUser,
  ) {
    const pipeline = await this.pipelinesService.findOne(pipelineId, user);
    const effectiveEnabled = dto.scheduleEnabled ?? pipeline.scheduleEnabled;
    const effectiveCron = (dto.scheduleCron ?? pipeline.scheduleCron ?? '').trim();
    const effectiveTimezone = (dto.scheduleTimezone ?? pipeline.scheduleTimezone ?? 'UTC').trim();
    const effectiveIncrementalMode = dto.incrementalMode ?? pipeline.incrementalMode;

    if (pipeline.status === PipelineStatus.ARCHIVED && effectiveEnabled) {
      throw new BadRequestException('Archived pipelines cannot be scheduled');
    }

    if (effectiveEnabled && effectiveCron.length === 0) {
      throw new BadRequestException('scheduleCron is required when scheduleEnabled is true');
    }

    if (effectiveEnabled) {
      const cronValidation = validateCronExpression(effectiveCron);
      if (!cronValidation.valid) {
        throw new BadRequestException(cronValidation.errors);
      }
      if (!validateTimezone(effectiveTimezone)) {
        throw new BadRequestException('Invalid schedule timezone');
      }
    }

    const baseTime = new Date();
    const nextRunAt =
      effectiveEnabled && pipeline.status === PipelineStatus.ACTIVE
        ? computeNextRunAt(effectiveCron, effectiveTimezone, baseTime)
        : null;

    const updated = await this.prisma.syncPipeline.update({
      where: { id: pipeline.id },
      data: {
        scheduleEnabled: effectiveEnabled,
        scheduleCron: effectiveEnabled ? effectiveCron : pipeline.scheduleCron,
        scheduleTimezone: effectiveEnabled ? effectiveTimezone : pipeline.scheduleTimezone ?? 'UTC',
        nextRunAt,
        incrementalMode: effectiveIncrementalMode,
      },
    });

    await this.auditService.log({
      action: 'pipeline_schedule_updated',
      entityType: 'pipeline',
      entityId: pipeline.id,
      actor: user,
      metadataJson: {
        pipelineId: pipeline.id,
        scheduleEnabled: updated.scheduleEnabled,
        scheduleCron: updated.scheduleCron,
        scheduleTimezone: updated.scheduleTimezone,
        nextRunAt: updated.nextRunAt,
        incrementalMode: updated.incrementalMode,
      },
    });

    if (pipeline.scheduleEnabled !== updated.scheduleEnabled) {
      await this.auditService.log({
        action: updated.scheduleEnabled
          ? 'pipeline_schedule_enabled'
          : 'pipeline_schedule_disabled',
        entityType: 'pipeline',
        entityId: pipeline.id,
        actor: user,
        metadataJson: {
          pipelineId: pipeline.id,
          scheduleEnabled: updated.scheduleEnabled,
          nextRunAt: updated.nextRunAt,
        },
      });
    }

    return this.toScheduleResponse(updated);
  }

  async triggerPipelineSchedule(pipelineId: string, user: AuthenticatedUser) {
    const pipeline = await this.pipelinesService.findOne(pipelineId, user);
    if (pipeline.status === PipelineStatus.ARCHIVED) {
      throw new BadRequestException('Archived pipelines cannot be triggered');
    }
    if (pipeline.status === PipelineStatus.PAUSED) {
      throw new BadRequestException('Paused pipelines cannot be triggered');
    }

    const hasActiveRun = await this.syncRunsService.hasActiveRun(pipeline.id);
    if (hasActiveRun) {
      await this.auditService.log({
        action: 'scheduled_pipeline_skipped',
        entityType: 'pipeline',
        entityId: pipeline.id,
        actor: user,
        metadataJson: {
          pipelineId: pipeline.id,
          triggerType: SyncRunTriggerType.SCHEDULED,
          reason: 'active_run_exists',
        },
      });
      throw new BadRequestException('A queued or running sync already exists for this pipeline');
    }

    const run = await this.syncRunsService.createScheduledForPipeline(pipeline.id, {
      ignoreCursor: false,
      actor: user,
    });

    await this.auditService.log({
      action: 'scheduled_sync_enqueued',
      entityType: 'pipeline',
      entityId: pipeline.id,
      actor: user,
      metadataJson: {
        pipelineId: pipeline.id,
        triggerType: SyncRunTriggerType.SCHEDULED,
        syncRunId: 'syncRunId' in run ? run.syncRunId : run.id,
        jobId: 'jobId' in run ? run.jobId : null,
      },
    });

    return run;
  }

  getSchedulerStatus() {
    return {
      schedulerEnabled: this.schedulerEnabled,
      processRole: this.processRole,
      pollIntervalSeconds: this.pollIntervalSeconds,
      lockTtlSeconds: this.lockTtlSeconds,
      lastPollAt: this.lastPollAt,
      lastPollDurationMs: this.lastPollDurationMs,
      lastDuePipelines: this.lastDuePipelines,
      lastEnqueued: this.lastEnqueued,
      lastSkipped: this.lastSkipped,
      lastError: this.lastError,
    };
  }

  async runPollingCycle() {
    if (!this.shouldRunPolling()) {
      return;
    }

    const now = Date.now();
    if (this.pollInProgress || now < this.lockUntil) {
      return;
    }

    this.pollInProgress = true;
    this.lockUntil = now + this.lockTtlSeconds * 1000;
    this.lastPollAt = new Date();
    const tickStartedAt = Date.now();

    try {
      this.structuredLogger.info('scheduler_tick_started', {
        schedulerEnabled: this.schedulerEnabled,
        pollIntervalSeconds: this.pollIntervalSeconds,
      });
      await this.auditService.log({
        action: 'scheduler_tick_started',
        entityType: 'scheduler',
        entityId: 'default',
        metadataJson: {
          startedAt: this.lastPollAt,
        },
      });

      const summary = await this.enqueueDuePipelines();
      this.lastDuePipelines = summary.duePipelines;
      this.lastEnqueued = summary.enqueued;
      this.lastSkipped = summary.skipped;
      this.lastPollDurationMs = Date.now() - tickStartedAt;
      this.lastError = null;

      this.structuredLogger.info('scheduler_tick_completed', {
        duePipelines: summary.duePipelines,
        enqueued: summary.enqueued,
        skipped: summary.skipped,
        durationMs: this.lastPollDurationMs,
      });
      await this.auditService.log({
        action: 'scheduler_tick_completed',
        entityType: 'scheduler',
        entityId: 'default',
        metadataJson: {
          duePipelines: summary.duePipelines,
          enqueued: summary.enqueued,
          skipped: summary.skipped,
          durationMs: this.lastPollDurationMs,
        },
      });

      if (summary.duePipelines > 0) {
        this.logger.log(
          `Scheduler cycle: due=${summary.duePipelines}, enqueued=${summary.enqueued}, skipped=${summary.skipped}`,
        );
      }
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : 'unknown error';
      this.lastError = safeMessage;
      this.lastPollDurationMs = Date.now() - tickStartedAt;

      this.logger.error(
        `Scheduler cycle failed: ${safeMessage}`,
      );
      this.structuredLogger.error('scheduler_tick_failed', {
        errorMessage: safeMessage,
        durationMs: this.lastPollDurationMs,
      });
      await this.auditService.log({
        action: 'scheduler_tick_failed',
        entityType: 'scheduler',
        entityId: 'default',
        metadataJson: {
          errorMessage: safeMessage,
          durationMs: this.lastPollDurationMs,
        },
      });
    } finally {
      this.pollInProgress = false;
      this.lockUntil = 0;
    }
  }

  private async enqueueDuePipelines(): Promise<PollSummary> {
    const now = new Date();
    const duePipelines = await this.prisma.syncPipeline.findMany({
      where: {
        status: PipelineStatus.ACTIVE,
        scheduleEnabled: true,
        scheduleCron: { not: null },
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
    });

    let enqueued = 0;
    let skipped = 0;

    for (const pipeline of duePipelines) {
      const cron = (pipeline.scheduleCron ?? '').trim();
      const timezone = (pipeline.scheduleTimezone ?? 'UTC').trim() || 'UTC';
      const actor: AuditActor = {
        sub: pipeline.ownerId,
        role: UserRole.OPERATOR,
      };

      if (cron.length === 0 || !validateTimezone(timezone) || !validateCronExpression(cron).valid) {
        skipped += 1;
        await this.auditService.log({
          action: 'scheduled_pipeline_skipped',
          entityType: 'pipeline',
          entityId: pipeline.id,
          actor,
          metadataJson: {
            pipelineId: pipeline.id,
            reason: 'invalid_schedule_configuration',
          },
        });
        continue;
      }

      const hasActiveRun = await this.syncRunsService.hasActiveRun(pipeline.id);
      if (hasActiveRun) {
        skipped += 1;
        await this.auditService.log({
          action: 'scheduled_pipeline_skipped',
          entityType: 'pipeline',
          entityId: pipeline.id,
          actor,
          metadataJson: {
            pipelineId: pipeline.id,
            triggerType: SyncRunTriggerType.SCHEDULED,
            reason: 'active_run_exists',
          },
        });
        continue;
      }

      const run = await this.syncRunsService.createScheduledForPipeline(pipeline.id, {
        ignoreCursor: false,
        actor,
      });
      const nextRunAt = computeNextRunAt(cron, timezone, now);

      await this.prisma.syncPipeline.update({
        where: { id: pipeline.id },
        data: {
          nextRunAt,
        },
      });

      await this.auditService.log({
        action: 'scheduled_sync_enqueued',
        entityType: 'pipeline',
        entityId: pipeline.id,
        actor,
        metadataJson: {
          pipelineId: pipeline.id,
          triggerType: SyncRunTriggerType.SCHEDULED,
          syncRunId: 'syncRunId' in run ? run.syncRunId : run.id,
          jobId: 'jobId' in run ? run.jobId : null,
          nextRunAt,
        },
      });

      enqueued += 1;
    }

    return {
      duePipelines: duePipelines.length,
      enqueued,
      skipped,
    };
  }

  private shouldRunPolling() {
    return this.schedulerEnabled && this.processRole === 'worker' && !this.isTestEnv;
  }

  private toScheduleResponse(pipeline: {
    id: string;
    scheduleEnabled: boolean;
    scheduleCron: string | null;
    scheduleTimezone: string | null;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
    incrementalMode: boolean;
    cursorJson: Prisma.JsonValue | null;
    status: PipelineStatus;
  }) {
    return {
      pipelineId: pipeline.id,
      pipelineStatus: pipeline.status,
      scheduleEnabled: pipeline.scheduleEnabled,
      scheduleCron: pipeline.scheduleCron,
      scheduleTimezone: pipeline.scheduleTimezone,
      nextRunAt: pipeline.nextRunAt,
      lastRunAt: pipeline.lastRunAt,
      incrementalMode: pipeline.incrementalMode,
      cursorSummary: this.toCursorSummary(pipeline.cursorJson),
    };
  }

  private toCursorSummary(cursorJson: Prisma.JsonValue | null) {
    if (!cursorJson || typeof cursorJson !== 'object' || Array.isArray(cursorJson)) {
      return null;
    }

    const raw = cursorJson as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    if (typeof raw.sequence === 'number' && Number.isFinite(raw.sequence)) {
      summary.sequence = raw.sequence;
    }
    if (typeof raw.updatedAt === 'string') {
      summary.updatedAt = raw.updatedAt;
    }
    return Object.keys(summary).length > 0 ? summary : null;
  }

  private getIntConfig(key: string, fallback: number, minValue: number) {
    const raw = this.configService.get<string>(key, String(fallback));
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < minValue) {
      return fallback;
    }
    return parsed;
  }
}
