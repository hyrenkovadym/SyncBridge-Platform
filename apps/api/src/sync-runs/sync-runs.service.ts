import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SyncRunStatus, UserRole } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PrismaService } from '../prisma/prisma.service';
import { MappingValidationError } from '../transformations/transformation-errors';
import { TransformationEngineService } from '../transformations/transformation-engine.service';
import { CreateSyncRunDto } from './dto/create-sync-run.dto';
import { ListSyncRunsQueryDto } from './dto/list-sync-runs-query.dto';

@Injectable()
export class SyncRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelinesService: PipelinesService,
    private readonly auditService: AuditService,
    private readonly transformationEngine: TransformationEngineService,
  ) {}

  async createForPipeline(pipelineId: string, dto: CreateSyncRunDto, user: AuthenticatedUser) {
    const pipeline = await this.pipelinesService.findOne(pipelineId, user);
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

    const mockRecords = dto.mockRecords ?? dto.sampleRecords ?? [];
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
          entityId: initialRun.id,
          actor: user,
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
            syncRunId: initialRun.id,
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
          entityId: initialRun.id,
          actor: user,
          metadataJson: {
            pipelineId: pipeline.id,
            externalId: record.externalId ?? null,
          },
        });
        await this.auditService.log({
          action: 'synced_record_created',
          entityType: 'synced_record',
          entityId: syncedRecord.id,
          actor: user,
          metadataJson: {
            pipelineId: pipeline.id,
            syncRunId: initialRun.id,
            externalId: syncedRecord.externalId,
          },
        });
      } catch {
        failedCount += 1;
      }
    }

    const completedRun = await this.prisma.syncRun.update({
      where: { id: initialRun.id },
      data: {
        status: failedCount > 0 ? SyncRunStatus.FAILED : SyncRunStatus.SUCCESS,
        recordsReceived: mockRecords.length,
        recordsProcessed: createdCount,
        recordsFailed: failedCount,
        finishedAt: new Date(),
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
        errorCount: totalErrorCount,
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

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }

  private ensureRecordObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private compileMappingOrThrow(mappingJson: Record<string, unknown>) {
    try {
      return this.transformationEngine.compileMapping(mappingJson);
    } catch (error) {
      if (error instanceof MappingValidationError) {
        throw new BadRequestException(error.errors.map((item) => item.message));
      }
      throw error;
    }
  }
}
