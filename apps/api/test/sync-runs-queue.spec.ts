import { BackgroundJobStatus, PipelineStatus, SyncRunStatus, UserRole } from '@prisma/client';

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

function createService(queueMode: 'sync' | 'async', pipelineMapping?: Record<string, unknown>) {
  const prisma = new InMemoryPrismaService();
  const pipeline = createPipelineFixture('user-1', pipelineMapping);

  const pipelinesService = {
    findOne: jest.fn(async () => pipeline),
    getById: jest.fn(async () => pipeline),
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
    const { service, prisma, jobsService } = createService('sync');
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
    expect(result.summary.recordsReceived).toBe(1);
    expect(result.summary.recordsProcessed).toBe(1);
    expect(result.summary.recordsFailed).toBe(0);
    expect((jobsService.enqueueExecuteSyncRunJob as jest.Mock).mock.calls).toHaveLength(0);

    const jobs = await prisma.backgroundJob.findMany();
    expect(jobs).toHaveLength(0);
  });

  it('QUEUE_MODE=async creates queued run and background job', async () => {
    const { service, prisma, jobsService } = createService('async');
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

    const job = await prisma.backgroundJob.findUnique({ where: { id: result.jobId } });
    expect(job?.status).toBe(BackgroundJobStatus.QUEUED);
    expect(job?.entityId).toBe(result.syncRunId);
  });

  it('worker-like processing completes async sync run successfully', async () => {
    const { service, prisma } = createService('async');
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
    const { service, prisma } = createService('async', {
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
});
