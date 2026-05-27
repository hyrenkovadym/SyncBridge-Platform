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

    if (this.queueMode === 'async') {
      return this.queueSyncRun(pipeline, mockRecords, user);
    }

    return this.executeSyncRunNow(pipeline, mockRecords, user);
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
      },
    });

    try {
      const summary = await this.processRunRecords(syncRun.id, pipeline, payload.mockRecords, actor);
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
          attempts,
          durationMs,
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

  private async queueSyncRun(
    pipeline: SyncPipeline,
    mockRecords: SyncRunMockRecordPayload[],
    user: AuthenticatedUser,
  ) {
    const syncRun = await this.prisma.syncRun.create({
      data: {
        pipelineId: pipeline.id,
        status: SyncRunStatus.QUEUED,
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
          recordsReceived: mockRecords.length,
        },
      },
    });

    await this.jobsService.enqueueExecuteSyncRunJob({
      backgroundJobId: backgroundJob.id,
      syncRunId: syncRun.id,
      pipelineId: pipeline.id,
      requestedByUserId: user.sub,
      requestedByRole: user.role,
      mockRecords: mockRecords.map((record) => ({
        externalId: record.externalId,
        raw: this.ensureRecordObject(record.raw),
      })),
    });

    await this.auditService.log({
      action: 'sync_run_queued',
      entityType: 'sync_run',
      entityId: syncRun.id,
      actor: user,
      metadataJson: {
        jobId: backgroundJob.id,
        syncRunId: syncRun.id,
        pipelineId: pipeline.id,
        status: SyncRunStatus.QUEUED,
        attempts: 0,
        recordsReceived: mockRecords.length,
      },
    });

    await this.auditService.log({
      action: 'background_job_queued',
      entityType: 'background_job',
      entityId: backgroundJob.id,
      actor: user,
      metadataJson: {
        jobId: backgroundJob.id,
        syncRunId: syncRun.id,
        pipelineId: pipeline.id,
        status: BackgroundJobStatus.QUEUED,
        attempts: 0,
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

  private async executeSyncRunNow(
    pipeline: SyncPipeline,
    mockRecords: SyncRunMockRecordPayload[],
    user: AuthenticatedUser,
  ) {
    const startedAt = new Date();
    const initialRun = await this.prisma.syncRun.create({
      data: {
        pipelineId: pipeline.id,
        status: SyncRunStatus.RUNNING,
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
      actor: user,
      metadataJson: {
        syncRunId: initialRun.id,
        pipelineId: pipeline.id,
        status: SyncRunStatus.RUNNING,
        attempts: 1,
      },
    });

    const summary = await this.processRunRecords(initialRun.id, pipeline, mockRecords, user);
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

    await this.auditService.log({
      action: finalRunStatus === SyncRunStatus.SUCCESS ? 'sync_run_completed' : 'sync_run_failed',
      entityType: 'sync_run',
      entityId: completedRun.id,
      actor: user,
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
      },
    });

    await this.auditService.log({
      action: 'sync_run_created',
      entityType: 'sync_run',
      entityId: completedRun.id,
      actor: user,
      metadataJson: {
        pipelineId: pipeline.id,
        recordsReceived: completedRun.recordsReceived,
        recordsProcessed: completedRun.recordsProcessed,
        recordsFailed: completedRun.recordsFailed,
        errorCount: summary.errorCount,
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
    actor?: AuditActor,
  ): Promise<RunProcessingSummary> {
    const compiledMapping = this.compileMappingOrThrow(pipeline.mappingJson as Record<string, unknown>);
    let createdCount = 0;
    let failedCount = 0;
    let totalErrorCount = 0;

    for (const record of mockRecords) {
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

    return {
      recordsReceived: mockRecords.length,
      recordsProcessed: createdCount,
      recordsFailed: failedCount,
      errorCount: totalErrorCount,
    };
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
