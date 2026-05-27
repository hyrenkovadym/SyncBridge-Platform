import { PipelineStatus, SyncRunTriggerType, UserRole } from '@prisma/client';

import { AuditService } from '../src/audit/audit.service';
import { PipelinesService } from '../src/pipelines/pipelines.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { SyncRunsService } from '../src/sync-runs/sync-runs.service';
import { StructuredLoggerService } from '../src/common/logging/structured-logger.service';

type ConfigMap = Record<string, string>;

function createConfigService(config: ConfigMap) {
  return {
    get: (key: string, fallback?: string) => config[key] ?? fallback,
  };
}

function createDuePipelineFixture() {
  return {
    id: 'pipeline-1',
    ownerId: 'owner-1',
    status: PipelineStatus.ACTIVE,
    scheduleEnabled: true,
    scheduleCron: '*/5 * * * *',
    scheduleTimezone: 'UTC',
    nextRunAt: new Date(Date.now() - 5 * 60 * 1000),
    lastRunAt: null,
    incrementalMode: false,
    cursorJson: null,
  };
}

function createService(overrides?: Partial<ConfigMap>) {
  const prisma = {
    syncPipeline: {
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        ...data,
      })),
    },
  } as unknown as PrismaService;

  const pipelinesService = {} as PipelinesService;

  const syncRunsService = {
    hasActiveRun: jest.fn(async () => false),
    createScheduledForPipeline: jest.fn(async (pipelineId: string) => ({
      id: `${pipelineId}-run`,
      triggerType: SyncRunTriggerType.SCHEDULED,
    })),
  } as unknown as SyncRunsService;

  const auditService = {
    log: jest.fn(async () => ({})),
  } as unknown as AuditService;

  const configService = createConfigService({
    SCHEDULER_ENABLED: 'true',
    SCHEDULER_POLL_INTERVAL_SECONDS: '30',
    SCHEDULER_LOCK_TTL_SECONDS: '60',
    SYNCBRIDGE_PROCESS_ROLE: 'worker',
    NODE_ENV: 'development',
    ...overrides,
  });

  const service = new SchedulerService(
    prisma,
    pipelinesService,
    syncRunsService,
    auditService,
    configService as never,
    {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as StructuredLoggerService,
  );

  return { service, prisma, syncRunsService, auditService };
}

describe('SchedulerService', () => {
  it('enqueues due pipelines', async () => {
    const { service, prisma, syncRunsService, auditService } = createService();
    const duePipeline = createDuePipelineFixture();

    (prisma.syncPipeline.findMany as jest.Mock).mockResolvedValueOnce([duePipeline]);

    await service.runPollingCycle();

    expect(prisma.syncPipeline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PipelineStatus.ACTIVE,
          scheduleEnabled: true,
          scheduleCron: { not: null },
          nextRunAt: expect.any(Object),
        }),
      }),
    );
    expect(syncRunsService.hasActiveRun).toHaveBeenCalledWith(duePipeline.id);
    expect(syncRunsService.createScheduledForPipeline).toHaveBeenCalledWith(duePipeline.id, {
      ignoreCursor: false,
      actor: {
        sub: duePipeline.ownerId,
        role: UserRole.OPERATOR,
      },
    });
    expect(prisma.syncPipeline.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: duePipeline.id },
        data: expect.objectContaining({
          nextRunAt: expect.any(Date),
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduled_sync_enqueued',
      }),
    );
  });

  it('skips enqueue when active run already exists', async () => {
    const { service, prisma, syncRunsService, auditService } = createService();
    const duePipeline = createDuePipelineFixture();

    (prisma.syncPipeline.findMany as jest.Mock).mockResolvedValueOnce([duePipeline]);
    (syncRunsService.hasActiveRun as jest.Mock).mockResolvedValueOnce(true);

    await service.runPollingCycle();

    expect(syncRunsService.createScheduledForPipeline).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduled_pipeline_skipped',
        metadataJson: expect.objectContaining({
          pipelineId: duePipeline.id,
          reason: 'active_run_exists',
        }),
      }),
    );
  });

  it('does not poll when scheduler is disabled', async () => {
    const { service, prisma } = createService({ SCHEDULER_ENABLED: 'false' });
    await service.runPollingCycle();
    expect(prisma.syncPipeline.findMany).not.toHaveBeenCalled();
  });

  it('returns scheduler status with observability fields', () => {
    const { service } = createService();
    const status = service.getSchedulerStatus();
    expect(status).toEqual(
      expect.objectContaining({
        schedulerEnabled: true,
        processRole: 'worker',
        pollIntervalSeconds: 30,
        lockTtlSeconds: 60,
        lastDuePipelines: expect.any(Number),
        lastEnqueued: expect.any(Number),
        lastSkipped: expect.any(Number),
      }),
    );
  });
});
