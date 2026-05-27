import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
  ) {}

  health() {
    return {
      status: 'ok',
      service: 'syncbridge-api',
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const queueMode = this.configService.get<string>('QUEUE_MODE', 'sync');
    const processRole = this.configService.get<string>('SYNCBRIDGE_PROCESS_ROLE', 'api');
    const schedulerEnabled = this.configService.get<string>('SCHEDULER_ENABLED', 'false') === 'true';
    const pollIntervalSeconds = Number(
      this.configService.get<string>('SCHEDULER_POLL_INTERVAL_SECONDS', '30'),
    );

    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'down',
        queueMode,
        scheduler: {
          enabled: schedulerEnabled,
          processRole,
          pollIntervalSeconds,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const redis = await this.jobsService.checkRedisHealth();
    const redisUp =
      redis.status === 'up' || redis.status === 'skipped' || redis.status === 'unknown';

    if (!redisUp) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'up',
        redis: redis.status,
        queueMode,
        scheduler: {
          enabled: schedulerEnabled,
          processRole,
          pollIntervalSeconds,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ready',
      database: 'up',
      redis,
      queueMode,
      scheduler: {
        enabled: schedulerEnabled,
        processRole,
        pollIntervalSeconds,
      },
      timestamp: new Date().toISOString(),
    };
  }

  systemInfo() {
    const queueMode = this.configService.get<string>('QUEUE_MODE', 'sync');
    const schedulerEnabled = this.configService.get<string>('SCHEDULER_ENABLED', 'false') === 'true';
    const processRole = this.configService.get<string>('SYNCBRIDGE_PROCESS_ROLE', 'api');

    return {
      status: 'ok',
      service: 'syncbridge-api',
      nodeVersion: process.version,
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      queueMode,
      scheduler: {
        enabled: schedulerEnabled,
        pollIntervalSeconds: Number(
          this.configService.get<string>('SCHEDULER_POLL_INTERVAL_SECONDS', '30'),
        ),
        lockTtlSeconds: Number(this.configService.get<string>('SCHEDULER_LOCK_TTL_SECONDS', '60')),
        processRole,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
