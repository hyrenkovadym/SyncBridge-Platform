import {
  BackgroundJobStatus,
  PipelineStatus,
  SyncRunStatus,
  SyncRunTriggerType,
  UserRole,
} from '@prisma/client';

import { AuditService } from '../src/audit/audit.service';
import { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface';
import { JobsService } from '../src/jobs/jobs.service';
import { PipelinesService } from '../src/pipelines/pipelines.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreateSyncRunDto } from '../src/sync-runs/dto/create-sync-run.dto';
import { SyncRunsService } from '../src/sync-runs/sync-runs.service';
import { TransformationEngineService } from '../src/transformations/transformation-engine.service';
import { InMemoryPrismaService } from './in-memory-prisma';

function createPipelineFixture(ownerId = 'user-1', mappingJson?: Record<string, unknown>) {
  return {
    id: 'pipeline-1',
    name: 'Pipeline',
    description: null,
    sourceConnectorId: 'connector-1',
    targetName: 'contacts',
    status: PipelineStatus.ACTIVE,
    mappingJson: mappingJson ?? {
      fields: {
        email: { path: 'email', type: 'string', required: true, trim: true, lowercase: true },
      },
    },
    scheduleEnabled: false,
    scheduleCron: null,
    scheduleTimezone: null,
    nextRunAt: null,
    lastRunAt: null,
    cursorJson: null,
    incrementalMode: false,
    ownerId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createUser(ownerId = 'user-1'): AuthenticatedUser {
  return {
    sub: ownerId,
    email: `${ownerId}@example.com`,
    role: UserRole.USER,
  };
}

function createConfigService(queueMode: 'sync' | 'async') {
  return {
    get: (key: string, fallback?: string) => {
      if (key === 'QUEUE_MODE') {
        return queueMode;
      }
      return fallback;
    },
  };
}

async function createService(queueMode: 'sync' | 'async', pipelineMapping?: Record<string, unknown>) {
  const prisma = new InMemoryPrismaService();
  const pipeline = createPipelineFixture('user-1', pipelineMapping);
  await prisma.syncPipeline.create({ data: pipeline });

  const pipelinesService = {
    findOne: jest.fn(async (id: string) => {
      const found = await prisma.syncPipeline.findUnique({ where: { id } });
      if (!found) {
        throw new Error('Pipeline not found');
      }
      return found;
    }),
    getById: jest.fn(async (id: string) => {
      const found = await prisma.syncPipeline.findUnique({ where: { id } });
      if (!found) {
        throw new Error('Pipeline not found');
      }
      return found;
    }),
  } as unknown as PipelinesService;

  const auditService = {
    log: jest.fn(async () => ({})),
  } as unknown as AuditService;

  const jobsService = {
    enqueueExecuteSyncRunJob: jest.fn(async (payload: unknown) => ({
      jobId: (payload as { backgroundJobId: string }).backgroundJobId,
    })),
  } as unknown as JobsService;

  const service = new SyncRunsService(
    prisma as unknown as PrismaService,
    pipelinesService,
    auditService,
    new TransformationEngineService(),
    createConfigService(queueMode) as never,
    jobsService,
  );

  return { service, prisma, jobsService };
}

describe('SyncRunsService queue behavior', () => {
  it('QUEUE_MODE=sync preserves direct processing behavior', async () => {
    const { service, prisma, jobsService } = await createService('sync');
    const user = createUser();

    const result = await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [{ externalId: '1', raw: { email: ' USER@EXAMPLE.COM ' } }],
      } as CreateSyncRunDto,
      user,
    );

    if (!('summary' in result)) {
      throw new Error('Expected sync run response in sync mode');
    }

    expect(result.status).toBe(SyncRunStatus.SUCCESS);
    expect(result.triggerType).toBe(SyncRunTriggerType.MANUAL);
    expect(result.summary.recordsReceived).toBe(1);
    expect(result.summary.recordsProcessed).toBe(1);
    expect(result.summary.recordsFailed).toBe(0);
    expect((jobsService.enqueueExecuteSyncRunJob as jest.Mock).mock.calls).toHaveLength(0);

    const jobs = await prisma.backgroundJob.findMany();
    expect(jobs).toHaveLength(0);
  });

  it('QUEUE_MODE=async creates queued run and background job', async () => {
    const { service, prisma, jobsService } = await createService('async');
    const user = createUser();

    const result = await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [{ externalId: '1', raw: { email: 'USER@EXAMPLE.COM' } }],
      } as CreateSyncRunDto,
      user,
    );

    if (!('jobId' in result)) {
      throw new Error('Expected queued response in async mode');
    }

    expect(result.status).toBe(SyncRunStatus.QUEUED);
    expect(typeof result.jobId).toBe('string');
    expect(typeof result.syncRunId).toBe('string');
    expect((jobsService.enqueueExecuteSyncRunJob as jest.Mock).mock.calls).toHaveLength(1);

    const run = await prisma.syncRun.findUnique({ where: { id: result.syncRunId } });
    expect(run?.status).toBe(SyncRunStatus.QUEUED);
    expect(run?.triggerType).toBe(SyncRunTriggerType.MANUAL);

    const job = await prisma.backgroundJob.findUnique({ where: { id: result.jobId } });
    expect(job?.status).toBe(BackgroundJobStatus.QUEUED);
    expect(job?.entityId).toBe(result.syncRunId);
  });

  it('worker-like processing completes async sync run successfully', async () => {
    const { service, prisma } = await createService('async');
    const user = createUser();

    const queued = await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [{ externalId: '1', raw: { email: ' USER@EXAMPLE.COM ' } }],
      } as CreateSyncRunDto,
      user,
    );

    if (!('jobId' in queued)) {
      throw new Error('Expected queued response in async mode');
    }

    await service.processQueuedSyncRun(
      {
        backgroundJobId: queued.jobId,
        syncRunId: queued.syncRunId,
        pipelineId: queued.pipelineId,
        requestedByUserId: user.sub,
        requestedByRole: user.role,
        mockRecords: [{ externalId: '1', raw: { email: ' USER@EXAMPLE.COM ' } }],
        ignoreCursor: false,
        triggerType: SyncRunTriggerType.MANUAL,
      },
      1,
    );

    const updatedRun = await prisma.syncRun.findUnique({
      where: { id: queued.syncRunId },
    });

    expect(updatedRun?.status).toBe(SyncRunStatus.SUCCESS);
    expect(updatedRun?.recordsReceived).toBe(1);
    expect(updatedRun?.recordsProcessed).toBe(1);
    expect(updatedRun?.recordsFailed).toBe(0);
  });

  it('failed transformation increments recordsFailed in async processing', async () => {
    const { service, prisma } = await createService('async', {
      fields: {
        email: { path: 'email', type: 'string', required: true },
      },
    });
    const user = createUser();

    const queued = await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [{ externalId: 'missing-email', raw: {} }],
      } as CreateSyncRunDto,
      user,
    );

    if (!('jobId' in queued)) {
      throw new Error('Expected queued response in async mode');
    }

    await service.processQueuedSyncRun(
      {
        backgroundJobId: queued.jobId,
        syncRunId: queued.syncRunId,
        pipelineId: queued.pipelineId,
        requestedByUserId: user.sub,
        requestedByRole: user.role,
        mockRecords: [{ externalId: 'missing-email', raw: {} }],
        ignoreCursor: false,
        triggerType: SyncRunTriggerType.MANUAL,
      },
      1,
    );

    const updatedRun = await prisma.syncRun.findUnique({
      where: { id: queued.syncRunId },
    });

    expect(updatedRun?.status).toBe(SyncRunStatus.FAILED);
    expect(updatedRun?.recordsReceived).toBe(1);
    expect(updatedRun?.recordsProcessed).toBe(0);
    expect(updatedRun?.recordsFailed).toBe(1);
  });

  it('incremental cursor advances after successful run', async () => {
    const { service, prisma } = await createService('sync', {
      fields: {
        email: { path: 'email', type: 'string', required: true },
      },
    });
    const user = createUser();

    await prisma.syncPipeline.update({
      where: { id: 'pipeline-1' },
      data: {
        incrementalMode: true,
      },
    });

    const result = await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [{ externalId: '1', raw: { email: 'a@example.com', sequence: 10 } }],
      } as CreateSyncRunDto,
      user,
    );

    if (!('summary' in result)) {
      throw new Error('Expected sync response');
    }

    const pipeline = await prisma.syncPipeline.findUnique({ where: { id: 'pipeline-1' } });
    expect((pipeline?.cursorJson as { sequence?: number } | null)?.sequence).toBe(10);
  });

  it('incremental cursor does not advance after failed run', async () => {
    const { service, prisma } = await createService('sync', {
      fields: {
        email: { path: 'email', type: 'string', required: true },
      },
    });
    const user = createUser();

    await prisma.syncPipeline.update({
      where: { id: 'pipeline-1' },
      data: {
        incrementalMode: true,
        cursorJson: { sequence: 5 },
      },
    });

    await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [{ externalId: '1', raw: { sequence: 10 } }],
      } as CreateSyncRunDto,
      user,
    );

    const pipeline = await prisma.syncPipeline.findUnique({ where: { id: 'pipeline-1' } });
    expect((pipeline?.cursorJson as { sequence?: number } | null)?.sequence).toBe(5);
  });

  it('ignoreCursor processes all records in incremental mode', async () => {
    const { service, prisma } = await createService('sync', {
      fields: {
        email: { path: 'email', type: 'string', required: true },
      },
    });
    const user = createUser();

    await prisma.syncPipeline.update({
      where: { id: 'pipeline-1' },
      data: {
        incrementalMode: true,
        cursorJson: { sequence: 5 },
      },
    });

    const result = await service.createForPipeline(
      'pipeline-1',
      {
        ignoreCursor: true,
        mockRecords: [{ externalId: '1', raw: { email: 'b@example.com', sequence: 1 } }],
      } as CreateSyncRunDto,
      user,
    );

    if (!('summary' in result)) {
      throw new Error('Expected sync response');
    }

    expect(result.summary.recordsProcessed).toBe(1);
  });

  it('incremental mode skips old records', async () => {
    const { service, prisma } = await createService('sync', {
      fields: {
        email: { path: 'email', type: 'string', required: true },
      },
    });
    const user = createUser();

    await prisma.syncPipeline.update({
      where: { id: 'pipeline-1' },
      data: {
        incrementalMode: true,
        cursorJson: { sequence: 100 },
      },
    });

    const result = await service.createForPipeline(
      'pipeline-1',
      {
        mockRecords: [
          { externalId: '1', raw: { email: 'old@example.com', sequence: 50 } },
          { externalId: '2', raw: { email: 'new@example.com', sequence: 200 } },
        ],
      } as CreateSyncRunDto,
      user,
    );

    if (!('summary' in result)) {
      throw new Error('Expected sync response');
    }

    expect(result.summary.recordsReceived).toBe(2);
    expect(result.summary.recordsProcessed).toBe(1);
    expect(result.summary.recordsFailed).toBe(0);
  });

  it('scheduled run uses SCHEDULED trigger type', async () => {
    const { service } = await createService('sync', {
      fields: {
        email: { path: 'email', type: 'string', required: true },
      },
    });

    const run = await service.createScheduledForPipeline('pipeline-1', {
      mockRecords: [{ externalId: '1', raw: { email: 'scheduled@example.com' } }],
      ignoreCursor: false,
      actor: { sub: 'owner-1', role: UserRole.OPERATOR },
    });

    if (!('summary' in run)) {
      throw new Error('Expected sync response in sync mode');
    }

    expect(run.triggerType).toBe(SyncRunTriggerType.SCHEDULED);
  });
});
