import {
  BackgroundJobStatus,
  PipelineStatus,
  SyncRunStatus,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';

import { AuditService } from '../src/audit/audit.service';
import { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface';
import { JobsService } from '../src/jobs/jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransformationEngineService } from '../src/transformations/transformation-engine.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { InMemoryPrismaService } from './in-memory-prisma';

function createUser(sub: string, role: UserRole): AuthenticatedUser {
  return {
    sub,
    email: `${sub}@example.com`,
    role,
  };
}

function createService(queueMode: 'sync' | 'async') {
  const prisma = new InMemoryPrismaService();
  const auditService = {
    log: jest.fn(async () => ({})),
  } as unknown as AuditService;
  const jobsService = {
    isAsyncMode: jest.fn(() => queueMode === 'async'),
    enqueueProcessWebhookEventJob: jest.fn(async (payload: { backgroundJobId: string }) => ({
      jobId: payload.backgroundJobId,
    })),
  } as unknown as JobsService;

  const service = new WebhooksService(
    prisma as unknown as PrismaService,
    auditService,
    jobsService,
    new TransformationEngineService(),
  );

  return { service, prisma, jobsService };
}

async function seedConnectorAndPipeline(
  prisma: InMemoryPrismaService,
  ownerId = 'owner-1',
  pipelineStatus: PipelineStatus = PipelineStatus.ACTIVE,
) {
  const connector = await prisma.connector.create({
    data: {
      name: 'Webhook Source',
      type: 'WEBHOOK',
      ownerId,
      configJson: { endpoint: '/webhook' },
    },
  });

  const pipeline = await prisma.syncPipeline.create({
    data: {
      name: 'Webhook Pipeline',
      sourceConnectorId: connector.id,
      targetName: 'contacts',
      ownerId,
      status: pipelineStatus,
      mappingJson: {
        fields: {
          email: { path: 'contact.email', type: 'string', required: true, lowercase: true, trim: true },
        },
      },
    },
  });

  return { connector, pipeline };
}

describe('WebhooksService queue behavior', () => {
  it('QUEUE_MODE=async intake enqueues webhook processing job', async () => {
    const { service, prisma, jobsService } = createService('async');
    const { connector } = await seedConnectorAndPipeline(prisma);

    const response = await service.receiveEvent({
      connectorId: connector.id,
      payload: {
        eventType: 'customer.updated',
        contact: { email: 'USER@EXAMPLE.COM' },
      },
      headers: {
        'x-syncbridge-event-id': 'evt-1',
      },
    });

    expect(response.status).toBe(WebhookEventStatus.RECEIVED);
    expect(typeof response.jobId).toBe('string');
    expect((jobsService.enqueueProcessWebhookEventJob as jest.Mock).mock.calls).toHaveLength(1);

    const storedEvent = await prisma.webhookEvent.findUnique({ where: { id: response.id } });
    expect(storedEvent?.status).toBe(WebhookEventStatus.RECEIVED);

    const queuedJob = await prisma.backgroundJob.findUnique({ where: { id: response.jobId ?? '' } });
    expect(queuedJob?.status).toBe(BackgroundJobStatus.QUEUED);
    expect(queuedJob?.entityType).toBe('webhook_event');
    expect(queuedJob?.entityId).toBe(response.id);
  });

  it('worker-like webhook processing creates sync run and synced record', async () => {
    const { service, prisma } = createService('async');
    const { connector, pipeline } = await seedConnectorAndPipeline(prisma);

    const intake = await service.receiveEvent({
      connectorId: connector.id,
      payload: {
        eventType: 'customer.updated',
        contact: { email: ' USER@EXAMPLE.COM ' },
      },
      headers: {
        'x-syncbridge-event-id': 'evt-2',
      },
    });

    await service.processQueuedWebhookEvent(
      {
        backgroundJobId: intake.jobId ?? '',
        webhookEventId: intake.id,
      },
      1,
    );

    const storedEvent = await prisma.webhookEvent.findUnique({ where: { id: intake.id } });
    expect(storedEvent?.status).toBe(WebhookEventStatus.PROCESSED);

    const runs = await prisma.syncRun.findMany({ where: { pipelineId: pipeline.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe(SyncRunStatus.SUCCESS);

    const syncRunId = runs[0].id as string;
    const records = await prisma.syncedRecord.findMany({ where: { syncRunId } });
    expect(records).toHaveLength(1);
    expect((records[0].normalizedJson as { email?: string }).email).toBe('user@example.com');

    const job = await prisma.backgroundJob.findUnique({ where: { id: intake.jobId ?? '' } });
    expect(job?.status).toBe(BackgroundJobStatus.COMPLETED);
  });

  it('no active pipeline marks event IGNORED', async () => {
    const { service, prisma } = createService('async');
    const { connector } = await seedConnectorAndPipeline(prisma, 'owner-1', PipelineStatus.PAUSED);

    const intake = await service.receiveEvent({
      connectorId: connector.id,
      payload: { eventType: 'nothing.to.process' },
      headers: {},
    });

    await service.processQueuedWebhookEvent(
      {
        backgroundJobId: intake.jobId ?? '',
        webhookEventId: intake.id,
      },
      1,
    );

    const storedEvent = await prisma.webhookEvent.findUnique({ where: { id: intake.id } });
    expect(storedEvent?.status).toBe(WebhookEventStatus.IGNORED);
  });

  it('duplicate idempotency key does not enqueue twice', async () => {
    const { service, prisma, jobsService } = createService('async');
    const { connector } = await seedConnectorAndPipeline(prisma);

    const first = await service.receiveEvent({
      connectorId: connector.id,
      payload: { eventType: 'order.created' },
      headers: { 'x-syncbridge-event-id': 'evt-dup-1' },
    });

    const second = await service.receiveEvent({
      connectorId: connector.id,
      payload: { eventType: 'order.created' },
      headers: { 'x-syncbridge-event-id': 'evt-dup-1' },
    });

    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect((jobsService.enqueueProcessWebhookEventJob as jest.Mock).mock.calls).toHaveLength(1);

    const events = await prisma.webhookEvent.findMany({});
    expect(events).toHaveLength(1);
  });

  it('retry endpoint enforces ownership and allows operator', async () => {
    const { service, prisma } = createService('async');
    const { connector } = await seedConnectorAndPipeline(prisma, 'owner-1');

    const intake = await service.receiveEvent({
      connectorId: connector.id,
      payload: { eventType: 'retry-me' },
      headers: {},
      actor: createUser('owner-1', UserRole.USER),
    });

    await prisma.webhookEvent.update({
      where: { id: intake.id },
      data: {
        status: WebhookEventStatus.FAILED,
        errorMessage: 'forced',
      },
    });

    await expect(
      service.retryEvent(intake.id, createUser('user-2', UserRole.USER)),
    ).rejects.toThrow('You do not have access to this webhook event');

    const retried = await service.retryEvent(intake.id, createUser('ops-1', UserRole.OPERATOR));
    expect(retried.status).toBe(WebhookEventStatus.RECEIVED);
    expect(typeof retried.jobId).toBe('string');
  });

  it('webhook event job visibility is owner-scoped for USER and global for OPERATOR', async () => {
    const { service, prisma } = createService('async');
    const { connector } = await seedConnectorAndPipeline(prisma, 'owner-1');

    const intake = await service.receiveEvent({
      connectorId: connector.id,
      payload: { eventType: 'job.visibility' },
      headers: {},
    });

    const ownerJob = await service.getEventJob(intake.id, createUser('owner-1', UserRole.USER));
    expect(ownerJob.id).toBe(intake.jobId);

    await expect(
      service.getEventJob(intake.id, createUser('owner-2', UserRole.USER)),
    ).rejects.toThrow('You do not have access to this webhook event');

    const operatorJob = await service.getEventJob(intake.id, createUser('ops-1', UserRole.OPERATOR));
    expect(operatorJob.id).toBe(intake.jobId);
  });
});
