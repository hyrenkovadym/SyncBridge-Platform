import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BackgroundJobType, UserRole } from '@prisma/client';

import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(jobId: string, user: AuthenticatedUser) {
    const job = await this.prisma.backgroundJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Background job not found');
    }

    await this.assertCanAccessJob(job.entityId, job.type, user);
    return this.toPublicJob(job);
  }

  async getBySyncRunId(syncRunId: string, user: AuthenticatedUser) {
    const syncRun = await this.prisma.syncRun.findUnique({
      where: { id: syncRunId },
      include: { pipeline: true },
    });

    if (!syncRun) {
      throw new NotFoundException('Sync run not found');
    }

    if (!this.isPrivileged(user.role) && syncRun.pipeline.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this sync run');
    }

    const job = await this.prisma.backgroundJob.findFirst({
      where: {
        entityType: 'sync_run',
        entityId: syncRunId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new NotFoundException('Background job not found for sync run');
    }

    return this.toPublicJob(job);
  }

  private async assertCanAccessJob(
    entityId: string,
    jobType: BackgroundJobType,
    user: AuthenticatedUser,
  ) {
    if (this.isPrivileged(user.role)) {
      return;
    }

    if (jobType !== BackgroundJobType.SYNC_RUN) {
      throw new ForbiddenException('You do not have access to this job');
    }

    const syncRun = await this.prisma.syncRun.findUnique({
      where: { id: entityId },
      include: { pipeline: true },
    });

    if (!syncRun || syncRun.pipeline.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this job');
    }
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }

  private toPublicJob(job: {
    id: string;
    type: BackgroundJobType;
    status: string;
    entityType: string;
    entityId: string;
    attempts: number;
    lastError: string | null;
    metadataJson: unknown;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number | null;
  }) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      entityType: job.entityType,
      entityId: job.entityId,
      attempts: job.attempts,
      lastError: job.lastError,
      metadataJson: job.metadataJson ?? {},
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
    };
  }
}
