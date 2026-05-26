import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SyncRunStatus, UserRole } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSyncRunDto } from './dto/create-sync-run.dto';

@Injectable()
export class SyncRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelinesService: PipelinesService,
    private readonly auditService: AuditService,
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

    const sampleRecords = dto.sampleRecords ?? [];
    let createdCount = 0;

    if (sampleRecords.length > 0) {
      const recordsData = sampleRecords.map((record) => ({
        pipelineId: pipeline.id,
        syncRunId: initialRun.id,
        externalId: record.externalId ?? null,
        sourceType: record.sourceType?.trim() || 'MANUAL',
        rawJson: (record.rawJson ?? {}) as Prisma.InputJsonValue,
        normalizedJson: (record.normalizedJson ?? {}) as Prisma.InputJsonValue,
      }));

      const result = await this.prisma.syncedRecord.createMany({
        data: recordsData,
      });
      createdCount = result.count;
    }

    const completedRun = await this.prisma.syncRun.update({
      where: { id: initialRun.id },
      data: {
        status: SyncRunStatus.SUCCESS,
        recordsReceived: sampleRecords.length,
        recordsProcessed: createdCount,
        recordsFailed: Math.max(sampleRecords.length - createdCount, 0),
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
      },
    });

    return completedRun;
  }

  async listByPipeline(pipelineId: string, user: AuthenticatedUser) {
    await this.pipelinesService.findOne(pipelineId, user);
    return this.prisma.syncRun.findMany({
      where: { pipelineId },
      orderBy: { createdAt: 'desc' },
    });
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
}
