import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BackgroundJobStatus,
  BackgroundJobType,
  Prisma,
  SyncPipeline,
  SyncRunStatus,
  SyncRunTriggerType,
  UserRole,
} from '@prisma/client';

import { AuditActor, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ExecuteSyncRunJobPayload, SyncRunMockRecordPayload } from '../jobs/dto/execute-sync-run-job.dto';
import { JobsService } from '../jobs/jobs.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PrismaService } from '../prisma/prisma.service';
import { MappingValidationError } from '../transformations/transformation-errors';
import {
  NormalizedMappingField,
  TransformationEngineService,
} from '../transformations/transformation-engine.service';
import { CreateSyncRunDto } from './dto/create-sync-run.dto';
import { ListSyncRunsQueryDto } from './dto/list-sync-runs-query.dto';

type RunProcessingSummary = {
  recordsReceived: number;
  recordsProcessed: number;
  recordsFailed: number;
  errorCount: number;
  skippedByCursor: number;
  cursorAdvanced: boolean;
  cursorValue: Record<string, unknown> | null;
};

type CursorState = {
  sequence?: number;
  updatedAt?: string;
};

type CursorCandidate = {
  sequence?: number;
  updatedAt?: string;
};

type CreateRunOptions = {
  mockRecords: SyncRunMockRecordPayload[];
  ignoreCursor: boolean;
  triggerType: SyncRunTriggerType;
  actor?: AuditActor;
};

@Injectable()
export class SyncRunsService {
  private readonly queueMode: 'sync' | 'async';

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelinesService: PipelinesService,
    private readonly auditService: AuditService,
    private readonly transformationEngine: TransformationEngineService,
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
  ) {
    const queueModeRaw = this.configService.get<string>('QUEUE_MODE', 'sync').toLowerCase();
    this.queueMode = queueModeRaw === 'async' ? 'async' : 'sync';
  }

  async createForPipeline(pipelineId: string, dto: CreateSyncRunDto, user: AuthenticatedUser) {
    const pipeline = await this.pipelinesService.findOne(pipelineId, user);
    const mockRecords = dto.mockRecords ?? dto.sampleRecords ?? [];
    const ignoreCursor = dto.ignoreCursor === true;

    await this.auditService.log({
      action: 'manual_sync_triggered',
      entityType: 'pipeline',
      entityId: pipeline.id,
      actor: user,
      metadataJson: {
        pipelineId: pipeline.id,
        triggerType: SyncRunTriggerType.MANUAL,
        ignoreCursor,
        recordsReceived: mockRecords.length,
      },
    });

    return this.createRunFromPipeline(pipeline, {
      mockRecords,
      ignoreCursor,
      triggerType: SyncRunTriggerType.MANUAL,
      actor: user,
    });
  }

  async createScheduledForPipeline(
    pipelineId: string,
    params?: {
      mockRecords?: SyncRunMockRecordPayload[];
      ignoreCursor?: boolean;
      actor?: AuditActor;
    },
  ) {
    const pipeline = await this.pipelinesService.getById(pipelineId);
    return this.createRunFromPipeline(pipeline, {
      mockRecords: params?.mockRecords ?? [],
      ignoreCursor: params?.ignoreCursor === true,
      triggerType: SyncRunTriggerType.SCHEDULED,
      actor: params?.actor,
    });
  }

  async hasActiveRun(pipelineId: string) {
    const count = await this.prisma.syncRun.count({
      where: {
        pipelineId,
        status: {
          in: [SyncRunStatus.QUEUED, SyncRunStatus.RUNNING],
        },
      },
    });
    return count > 0;
  }

  async processQueuedSyncRun(payload: ExecuteSyncRunJobPayload, attempts: number) {
    const backgroundJob = await this.prisma.backgroundJob.findUnique({
      where: { id: payload.backgroundJobId },
    });
    if (!backgroundJob) {
      throw new NotFoundException('Background job not found');
    }

    const syncRun = await this.prisma.syncRun.findUnique({
      where: { id: payload.syncRunId },
    });
    if (!syncRun) {
      throw new NotFoundException('Sync run not found');
    }

    const pipeline = await this.pipelinesService.getById(payload.pipelineId);
    const startedAt = new Date();

    await this.prisma.backgroundJob.update({
      where: { id: backgroundJob.id },
      data: {
        status: BackgroundJobStatus.PROCESSING,
        startedAt,
        attempts,
      },
    });

    await this.prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: SyncRunStatus.RUNNING,
        startedAt,
      },
    });

    const actor = {
      sub: payload.requestedByUserId,
      role: payload.requestedByRole,
    };

    await this.auditService.log({
      action: 'background_job_started',
      entityType: 'background_job',
      entityId: backgroundJob.id,
      actor,
      metadataJson: {
        jobId: backgroundJob.id,
        syncRunId: syncRun.id,
        pipelineId: pipeline.id,
        status: BackgroundJobStatus.PROCESSING,
        attempts,
        triggerType: payload.triggerType,
      },
    });

    await this.auditService.log({
      action: 'sync_run_started',
      entityType: 'sync_run',
      entityId: syncRun.id,
      actor,
      metadataJson: {
        syncRunId: syncRun.id,
        pipelineId: pipeline.id,
        status: SyncRunStatus.RUNNING,
        attempts,
        triggerType: payload.triggerType,
      },
    });

    try {
      const summary = await this.processRunRecords(
        syncRun.id,
        pipeline,
        payload.mockRecords,
        payload.ignoreCursor,
        actor,
      );
      const finishedAt = new Date();
      const durationMs = startedAt ? finishedAt.getTime() - startedAt.getTime() : null;
      const finalRunStatus =
        summary.recordsFailed > 0 ? SyncRunStatus.FAILED : SyncRunStatus.SUCCESS;

      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: finalRunStatus,
          recordsReceived: summary.recordsReceived,
          recordsProcessed: summary.recordsProcessed,
          recordsFailed: summary.recordsFailed,
          errorMessage:
            summary.recordsFailed > 0 ? 'One or more records failed during processing.' : null,
          finishedAt,
        },
      });

      await this.prisma.syncPipeline.update({
        where: { id: pipeline.id },
        data: {
          lastRunAt: finishedAt,
        },
      });

      await this.prisma.backgroundJob.update({
        where: { id: backgroundJob.id },
        data: {
          status: BackgroundJobStatus.COMPLETED,
          finishedAt,
          durationMs,
          attempts,
          lastError: null,
          metadataJson: {
            pipelineId: pipeline.id,
            recordsReceived: summary.recordsReceived,
            recordsProcessed: summary.recordsProcessed,
            recordsFailed: summary.recordsFailed,
            errorCount: summary.errorCount,
            skippedByCursor: summary.skippedByCursor,
            triggerType: payload.triggerType,
          },
        },
      });

      await this.auditService.log({
        action: 'background_job_completed',
        entityType: 'background_job',
        entityId: backgroundJob.id,
        actor,
        metadataJson: {
          jobId: backgroundJob.id,
          syncRunId: syncRun.id,
          pipelineId: pipeline.id,
          status: BackgroundJobStatus.COMPLETED,
          attempts,
          durationMs,
          recordsReceived: summary.recordsReceived,
          recordsProcessed: summary.recordsProcessed,
          recordsFailed: summary.recordsFailed,
          skippedByCursor: summary.skippedByCursor,
          triggerType: payload.triggerType,
        },
      });

      await this.auditService.log({
        action: finalRunStatus === SyncRunStatus.SUCCESS ? 'sync_run_completed' : 'sync_run_failed',
        entityType: 'sync_run',
        entityId: syncRun.id,
        actor,
        metadataJson: {
          jobId: backgroundJob.id,
          syncRunId: syncRun.id,
          pipelineId: pipeline.id,
          status: finalRunStatus,
          recordsReceived: summary.recordsReceived,
          recordsProcessed: summary.recordsProcessed,
          recordsFailed: summary.recordsFailed,
          errorCount: summary.errorCount,
          skippedByCursor: summary.skippedByCursor,
          attempts,
          durationMs,
          triggerType: payload.triggerType,
        },
      });
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = startedAt ? finishedAt.getTime() - startedAt.getTime() : null;
      const message = this.sanitizeErrorMessage(error);

      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: SyncRunStatus.FAILED,
          errorMessage: message,
          finishedAt,
        },
      });

      await this.prisma.syncPipeline.update({
        where: { id: pipeline.id },
        data: {
          lastRunAt: finishedAt,
        },
      });

      await this.prisma.backgroundJob.update({
        where: { id: backgroundJob.id },
        data: {
          status: BackgroundJobStatus.FAILED,
          attempts,
          lastError: message,
          finishedAt,
          durationMs,
        },
      });

      await this.auditService.log({
        action: 'background_job_failed',
        entityType: 'background_job',
        entityId: backgroundJob.id,
        actor,
        metadataJson: {
          jobId: backgroundJob.id,
          syncRunId: syncRun.id,
          pipelineId: pipeline.id,
          status: BackgroundJobStatus.FAILED,
          attempts,
          durationMs,
          triggerType: payload.triggerType,
        },
      });

      await this.auditService.log({
        action: 'sync_run_failed',
        entityType: 'sync_run',
        entityId: syncRun.id,
        actor,
        metadataJson: {
          jobId: backgroundJob.id,
          syncRunId: syncRun.id,
          pipelineId: pipeline.id,
          status: SyncRunStatus.FAILED,
          attempts,
          durationMs,
          triggerType: payload.triggerType,
        },
      });

      throw error;
    }
  }

  async listByPipeline(pipelineId: string, user: AuthenticatedUser) {
    await this.pipelinesService.findOne(pipelineId, user);
    return this.prisma.syncRun.findMany({
      where: { pipelineId },
      include: {
        pipeline: {
          select: {
            id: true,
            name: true,
            targetName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll(query: ListSyncRunsQueryDto, user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const statusFilter = query.status ? { status: query.status } : {};
    if (this.isPrivileged(user.role)) {
      const [items, total] = await Promise.all([
        this.prisma.syncRun.findMany({
          where: statusFilter,
          include: {
            pipeline: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                targetName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.syncRun.count({ where: statusFilter }),
      ]);

      return { items, page, limit, total };
    }

    const ownedPipelines = await this.prisma.syncPipeline.findMany({
      where: { ownerId: user.sub },
      select: { id: true },
    });
    const pipelineIds = ownedPipelines.map((pipeline) => pipeline.id);
    if (pipelineIds.length === 0) {
      return { items: [], page, limit, total: 0 };
    }

    const userScopedFilter = {
      ...statusFilter,
      pipelineId: { in: pipelineIds },
    };

    const [items, total] = await Promise.all([
      this.prisma.syncRun.findMany({
        where: userScopedFilter,
        include: {
          pipeline: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              targetName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.syncRun.count({ where: userScopedFilter }),
    ]);

    return { items, page, limit, total };
  }

  async findById(id: string, user: AuthenticatedUser) {
    const run = await this.prisma.syncRun.findUnique({
      where: { id },
      include: {
        pipeline: true,
      },
    });

    if (!run) {
      throw new NotFoundException('Sync run not found');
    }

    if (!this.isPrivileged(user.role) && run.pipeline.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this sync run');
    }

    return run;
  }

  private async createRunFromPipeline(pipeline: SyncPipeline, options: CreateRunOptions) {
    if (this.queueMode === 'async') {
      return this.queueSyncRun(pipeline, options);
    }

    return this.executeSyncRunNow(pipeline, options);
  }

  private async queueSyncRun(pipeline: SyncPipeline, options: CreateRunOptions) {
    const syncRun = await this.prisma.syncRun.create({
      data: {
        pipelineId: pipeline.id,
        status: SyncRunStatus.QUEUED,
        triggerType: options.triggerType,
        recordsReceived: 0,
        recordsProcessed: 0,
        recordsFailed: 0,
      },
    });

    const backgroundJob = await this.prisma.backgroundJob.create({
      data: {
        type: BackgroundJobType.SYNC_RUN,
        status: BackgroundJobStatus.QUEUED,
        entityType: 'sync_run',
        entityId: syncRun.id,
        attempts: 0,
        metadataJson: {
          pipelineId: pipeline.id,
          recordsReceived: options.mockRecords.length,
          triggerType: options.triggerType,
          ignoreCursor: options.ignoreCursor,
        },
      },
    });

    await this.jobsService.enqueueExecuteSyncRunJob({
      backgroundJobId: backgroundJob.id,
      syncRunId: syncRun.id,
      pipelineId: pipeline.id,
      requestedByUserId: options.actor?.sub ?? 'system',
      requestedByRole: options.actor?.role ?? UserRole.OPERATOR,
      mockRecords: options.mockRecords.map((record) => ({
        externalId: record.externalId,
        raw: this.ensureRecordObject(record.raw),
      })),
      ignoreCursor: options.ignoreCursor,
      triggerType: options.triggerType,
    });

    await this.auditService.log({
      action: 'sync_run_queued',
      entityType: 'sync_run',
      entityId: syncRun.id,
      actor: options.actor,
      metadataJson: {
        jobId: backgroundJob.id,
        syncRunId: syncRun.id,
        pipelineId: pipeline.id,
        status: SyncRunStatus.QUEUED,
        attempts: 0,
        recordsReceived: options.mockRecords.length,
        ignoreCursor: options.ignoreCursor,
        triggerType: options.triggerType,
      },
    });

    await this.auditService.log({
      action: 'background_job_queued',
      entityType: 'background_job',
      entityId: backgroundJob.id,
      actor: options.actor,
      metadataJson: {
        jobId: backgroundJob.id,
        syncRunId: syncRun.id,
        pipelineId: pipeline.id,
        status: BackgroundJobStatus.QUEUED,
        attempts: 0,
        triggerType: options.triggerType,
      },
    });

    return {
      jobId: backgroundJob.id,
      syncRunId: syncRun.id,
      pipelineId: pipeline.id,
      status: SyncRunStatus.QUEUED,
      message: 'Sync run queued for background execution.',
    };
  }

  private async executeSyncRunNow(pipeline: SyncPipeline, options: CreateRunOptions) {
    const startedAt = new Date();
    const initialRun = await this.prisma.syncRun.create({
      data: {
        pipelineId: pipeline.id,
        status: SyncRunStatus.RUNNING,
        triggerType: options.triggerType,
        recordsReceived: 0,
        recordsProcessed: 0,
        recordsFailed: 0,
        startedAt,
      },
    });

    await this.auditService.log({
      action: 'sync_run_started',
      entityType: 'sync_run',
      entityId: initialRun.id,
      actor: options.actor,
      metadataJson: {
        syncRunId: initialRun.id,
        pipelineId: pipeline.id,
        status: SyncRunStatus.RUNNING,
        attempts: 1,
        triggerType: options.triggerType,
      },
    });

    const summary = await this.processRunRecords(
      initialRun.id,
      pipeline,
      options.mockRecords,
      options.ignoreCursor,
      options.actor,
    );
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const finalRunStatus = summary.recordsFailed > 0 ? SyncRunStatus.FAILED : SyncRunStatus.SUCCESS;

    const completedRun = await this.prisma.syncRun.update({
      where: { id: initialRun.id },
      data: {
        status: finalRunStatus,
        recordsReceived: summary.recordsReceived,
        recordsProcessed: summary.recordsProcessed,
        recordsFailed: summary.recordsFailed,
        errorMessage:
          summary.recordsFailed > 0 ? 'One or more records failed during processing.' : null,
        finishedAt,
      },
    });

    await this.prisma.syncPipeline.update({
      where: { id: pipeline.id },
      data: {
        lastRunAt: finishedAt,
      },
    });

    await this.auditService.log({
      action: finalRunStatus === SyncRunStatus.SUCCESS ? 'sync_run_completed' : 'sync_run_failed',
      entityType: 'sync_run',
      entityId: completedRun.id,
      actor: options.actor,
      metadataJson: {
        syncRunId: completedRun.id,
        pipelineId: pipeline.id,
        status: finalRunStatus,
        attempts: 1,
        durationMs,
        recordsReceived: completedRun.recordsReceived,
        recordsProcessed: completedRun.recordsProcessed,
        recordsFailed: completedRun.recordsFailed,
        errorCount: summary.errorCount,
        skippedByCursor: summary.skippedByCursor,
        triggerType: options.triggerType,
      },
    });

    await this.auditService.log({
      action: 'sync_run_created',
      entityType: 'sync_run',
      entityId: completedRun.id,
      actor: options.actor,
      metadataJson: {
        pipelineId: pipeline.id,
        recordsReceived: completedRun.recordsReceived,
        recordsProcessed: completedRun.recordsProcessed,
        recordsFailed: completedRun.recordsFailed,
        errorCount: summary.errorCount,
        skippedByCursor: summary.skippedByCursor,
        triggerType: options.triggerType,
      },
    });

    return {
      ...completedRun,
      summary: {
        recordsReceived: completedRun.recordsReceived,
        recordsProcessed: completedRun.recordsProcessed,
        recordsFailed: completedRun.recordsFailed,
      },
    };
  }

  private async processRunRecords(
    syncRunId: string,
    pipeline: SyncPipeline,
    mockRecords: SyncRunMockRecordPayload[],
    ignoreCursor: boolean,
    actor?: AuditActor,
  ): Promise<RunProcessingSummary> {
    const compiledMapping = this.compileMappingOrThrow(pipeline.mappingJson as Record<string, unknown>);
    const pipelineCursor = this.normalizeCursorState(pipeline.cursorJson);
    const shouldApplyCursor = pipeline.incrementalMode && !ignoreCursor;
    const eligibleRecords = shouldApplyCursor
      ? mockRecords.filter((record) =>
          this.shouldProcessRecord(record, pipelineCursor),
        )
      : mockRecords;

    let createdCount = 0;
    let failedCount = 0;
    let totalErrorCount = 0;
    let maxCursor: CursorCandidate | null = null;

    for (const record of eligibleRecords) {
      const raw = this.ensureRecordObject(record.raw);
      const transformed = this.transformationEngine.transformRecordWithCompiledMapping(raw, compiledMapping);
      totalErrorCount += transformed.errors.length;

      if (transformed.errors.length > 0) {
        failedCount += 1;
        await this.auditService.log({
          action: 'transformation_failed',
          entityType: 'sync_run',
          entityId: syncRunId,
          actor,
          metadataJson: {
            pipelineId: pipeline.id,
            externalId: record.externalId ?? null,
            errorCount: transformed.errors.length,
          },
        });
        continue;
      }

      try {
        const syncedRecord = await this.prisma.syncedRecord.create({
          data: {
            pipelineId: pipeline.id,
            syncRunId,
            externalId: record.externalId ?? null,
            sourceType: 'MANUAL',
            rawJson: raw as Prisma.InputJsonValue,
            normalizedJson: transformed.normalized as Prisma.InputJsonValue,
          },
        });

        const cursorCandidate = this.extractCursorCandidate(raw);
        maxCursor = this.pickLatestCursor(maxCursor, cursorCandidate);
        createdCount += 1;

        await this.auditService.log({
          action: 'transformation_applied',
          entityType: 'sync_run',
          entityId: syncRunId,
          actor,
          metadataJson: {
            pipelineId: pipeline.id,
            externalId: record.externalId ?? null,
          },
        });
        await this.auditService.log({
          action: 'synced_record_created',
          entityType: 'synced_record',
          entityId: syncedRecord.id,
          actor,
          metadataJson: {
            pipelineId: pipeline.id,
            syncRunId,
            externalId: syncedRecord.externalId,
          },
        });
      } catch {
        failedCount += 1;
        totalErrorCount += 1;
      }
    }

    const skippedByCursor = mockRecords.length - eligibleRecords.length;
    const isSuccessfulRun = failedCount === 0;
    let cursorAdvanced = false;
    let cursorValue: Record<string, unknown> | null = null;

    if (pipeline.incrementalMode) {
      if (isSuccessfulRun && maxCursor) {
        cursorValue = this.cursorCandidateToJson(maxCursor);
        if (cursorValue) {
          await this.prisma.syncPipeline.update({
            where: { id: pipeline.id },
            data: {
              cursorJson: cursorValue as Prisma.InputJsonValue,
            },
          });

          cursorAdvanced = true;
          await this.auditService.log({
            action: 'incremental_cursor_updated',
            entityType: 'pipeline',
            entityId: pipeline.id,
            actor,
            metadataJson: {
              pipelineId: pipeline.id,
              syncRunId,
              cursorSummary: cursorValue as Prisma.InputJsonValue,
            },
          });
        }
      } else {
        await this.auditService.log({
          action: 'incremental_cursor_not_advanced',
          entityType: 'pipeline',
          entityId: pipeline.id,
          actor,
          metadataJson: {
            pipelineId: pipeline.id,
            syncRunId,
            reason: isSuccessfulRun ? 'no_cursor_candidates' : 'run_failed',
          },
        });
      }
    }

    return {
      recordsReceived: mockRecords.length,
      recordsProcessed: createdCount,
      recordsFailed: failedCount,
      errorCount: totalErrorCount,
      skippedByCursor,
      cursorAdvanced,
      cursorValue,
    };
  }

  private shouldProcessRecord(record: SyncRunMockRecordPayload, cursor: CursorState | null) {
    if (!cursor) {
      return true;
    }
    const candidate = this.extractCursorCandidate(this.ensureRecordObject(record.raw));
    if (!candidate) {
      return true;
    }
    return this.isCandidateNewer(candidate, cursor);
  }

  private normalizeCursorState(value: unknown): CursorState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as Record<string, unknown>;
    const result: CursorState = {};

    if (typeof raw.sequence === 'number' && Number.isFinite(raw.sequence)) {
      result.sequence = raw.sequence;
    }

    if (typeof raw.updatedAt === 'string') {
      const date = new Date(raw.updatedAt);
      if (!Number.isNaN(date.getTime())) {
        result.updatedAt = date.toISOString();
      }
    }

    if (result.sequence === undefined && result.updatedAt === undefined) {
      return null;
    }

    return result;
  }

  private extractCursorCandidate(raw: Record<string, unknown>): CursorCandidate | null {
    const candidate: CursorCandidate = {};

    if (typeof raw.sequence === 'number' && Number.isFinite(raw.sequence)) {
      candidate.sequence = raw.sequence;
    } else if (typeof raw.sequence === 'string') {
      const parsed = Number(raw.sequence);
      if (Number.isFinite(parsed)) {
        candidate.sequence = parsed;
      }
    }

    const updatedAtRaw = raw.updatedAt;
    if (typeof updatedAtRaw === 'string' || typeof updatedAtRaw === 'number' || updatedAtRaw instanceof Date) {
      const parsedDate = new Date(updatedAtRaw);
      if (!Number.isNaN(parsedDate.getTime())) {
        candidate.updatedAt = parsedDate.toISOString();
      }
    }

    if (candidate.sequence === undefined && candidate.updatedAt === undefined) {
      return null;
    }

    return candidate;
  }

  private isCandidateNewer(candidate: CursorCandidate, cursor: CursorState) {
    if (candidate.sequence !== undefined && cursor.sequence !== undefined) {
      return candidate.sequence > cursor.sequence;
    }

    if (candidate.updatedAt && cursor.updatedAt) {
      return new Date(candidate.updatedAt).getTime() > new Date(cursor.updatedAt).getTime();
    }

    return true;
  }

  private pickLatestCursor(
    left: CursorCandidate | null,
    right: CursorCandidate | null,
  ): CursorCandidate | null {
    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }

    if (left.sequence !== undefined && right.sequence !== undefined) {
      return right.sequence > left.sequence ? right : left;
    }

    if (left.updatedAt && right.updatedAt) {
      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      return rightTime > leftTime ? right : left;
    }

    if (right.sequence !== undefined && left.sequence === undefined) {
      return right;
    }
    if (right.updatedAt && !left.updatedAt) {
      return right;
    }

    return left;
  }

  private cursorCandidateToJson(candidate: CursorCandidate | null): Record<string, unknown> | null {
    if (!candidate) {
      return null;
    }
    const output: Record<string, unknown> = {};
    if (candidate.sequence !== undefined) {
      output.sequence = candidate.sequence;
    }
    if (candidate.updatedAt) {
      output.updatedAt = candidate.updatedAt;
    }
    return Object.keys(output).length > 0 ? output : null;
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }

  private ensureRecordObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private compileMappingOrThrow(mappingJson: Record<string, unknown>): NormalizedMappingField[] {
    try {
      return this.transformationEngine.compileMapping(mappingJson);
    } catch (error) {
      if (error instanceof MappingValidationError) {
        throw new BadRequestException(error.errors.map((item) => item.message));
      }
      throw error;
    }
  }

  private sanitizeErrorMessage(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message)) {
          return message.join(', ');
        }
      }
    }

    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return 'Background sync run failed';
  }
}
