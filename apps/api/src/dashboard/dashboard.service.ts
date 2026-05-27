import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: AuthenticatedUser) {
    if (this.isPrivileged(user.role)) {
      const [connectorsCount, pipelinesCount, syncRunsCount, webhookEventsCount, failedRunsCount] =
        await Promise.all([
          this.prisma.connector.count(),
          this.prisma.syncPipeline.count(),
          this.prisma.syncRun.count(),
          this.prisma.webhookEvent.count(),
          this.prisma.syncRun.count({ where: { status: 'FAILED' } }),
        ]);

      const [latestRuns, latestWebhookEvents] = await Promise.all([
        this.prisma.syncRun.findMany({
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
          take: 5,
        }),
        this.prisma.webhookEvent.findMany({
          include: {
            connector: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { receivedAt: 'desc' },
          take: 5,
        }),
      ]);

      return {
        connectorsCount,
        pipelinesCount,
        syncRunsCount,
        webhookEventsCount,
        failedRunsCount,
        latestRuns,
        latestWebhookEvents,
      };
    }

    const [connectorsCount, pipelinesCount, ownedPipelines] = await Promise.all([
      this.prisma.connector.count({ where: { ownerId: user.sub } }),
      this.prisma.syncPipeline.count({ where: { ownerId: user.sub } }),
      this.prisma.syncPipeline.findMany({
        where: { ownerId: user.sub },
        select: { id: true },
      }),
    ]);
    const pipelineIds = ownedPipelines.map((pipeline) => pipeline.id);

    const pipelineFilter = pipelineIds.length > 0 ? { pipelineId: { in: pipelineIds } } : { id: '__none__' };

    const [syncRunsCount, failedRunsCount, latestRuns, webhookEventsCount, latestWebhookEvents] =
      await Promise.all([
        this.prisma.syncRun.count({ where: pipelineFilter }),
        this.prisma.syncRun.count({
          where: {
            ...pipelineFilter,
            status: 'FAILED',
          },
        }),
        this.prisma.syncRun.findMany({
          where: pipelineFilter,
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
          take: 5,
        }),
        this.prisma.webhookEvent.count({
          where: {
            connector: {
              ownerId: user.sub,
            },
          },
        }),
        this.prisma.webhookEvent.findMany({
          where: {
            connector: {
              ownerId: user.sub,
            },
          },
          include: {
            connector: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { receivedAt: 'desc' },
          take: 5,
        }),
      ]);

    return {
      connectorsCount,
      pipelinesCount,
      syncRunsCount,
      webhookEventsCount,
      failedRunsCount,
      latestRuns,
      latestWebhookEvents,
    };
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }
}
