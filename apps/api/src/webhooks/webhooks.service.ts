import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  BackgroundJobStatus,
  BackgroundJobType,
  PipelineStatus,
  Prisma,
  SyncRunStatus,
  SyncRunTriggerType,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';

import { AuditActor, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ProcessWebhookEventJobPayload } from '../jobs/dto/process-webhook-event-job.dto';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { MappingValidationError } from '../transformations/transformation-errors';
import {
  NormalizedMappingField,
  TransformationEngineService,
} from '../transformations/transformation-engine.service';
import { ListWebhookEventsQueryDto } from './dto/list-webhook-events-query.dto';

const WEBHOOK_MAX_PAYLOAD_BYTES = 250 * 1024;
const REDACTED_HEADER_VALUE = 'REDACTED';
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-auth-token']);

type WebhookProcessingSummary = {
  status: WebhookEventStatus;
  pipelineIds: string[];
  syncRunIds: string[];
  recordsProcessed: number;
  recordsFailed: number;
  message: string;
};

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly jobsService: JobsService,
    private readonly transformationEngine: TransformationEngineService,
  ) {}

  async receiveEvent(params: {
    connectorId: string;
    payload: unknown;
    headers: Record<string, unknown>;
    actor?: AuthenticatedUser;
  }) {
    const sanitizedPayload = this.sanitizePayload(params.payload);
    this.assertPayloadSize(sanitizedPayload);
    const redactedHeaders = this.redactHeaders(params.headers);
    const idempotencyKey = this.getIdempotencyKey(params.headers);

    if (idempotencyKey) {
      const existingEvent = await this.prisma.webhookEvent.findFirst({
        where: {
          sourceConnectorRef: params.connectorId,
          idempotencyKey,
        },
      });

      if (existingEvent) {
        await this.auditService.log({
          action: 'webhook_event_duplicate_ignored',
          entityType: 'webhook_event',
          entityId: existingEvent.id,
          actor: params.actor,
          metadataJson: {
            eventId: existingEvent.id,
            connectorId: params.connectorId,
            idempotencyKey,
          },
        });

        return {
          eventId: existingEvent.id,
          id: existingEvent.id,
          status: existingEvent.status,
          duplicate: true,
          message: 'Duplicate webhook event ignored.',
        };
      }
    }

    const connector = await this.prisma.connector.findUnique({
      where: { id: params.connectorId },
      select: { id: true, ownerId: true },
    });

    const eventType =
      typeof sanitizedPayload.eventType === 'string' && sanitizedPayload.eventType.trim().length > 0
        ? sanitizedPayload.eventType.trim()
        : 'generic_event';

    const event = await this.prisma.webhookEvent.create({
      data: {
        sourceConnectorRef: params.connectorId,
        connectorId: connector?.id ?? null,
        idempotencyKey,
        eventType,
        status: WebhookEventStatus.RECEIVED,
        payloadJson: sanitizedPayload as Prisma.InputJsonValue,
        headersJson: redactedHeaders as Prisma.InputJsonValue,
      },
    });

    await this.auditService.log({
      action: 'webhook_event_received',
      entityType: 'webhook_event',
      entityId: event.id,
      actor: params.actor,
      metadataJson: {
        eventId: event.id,
        connectorId: params.connectorId,
        eventType: event.eventType,
        idempotencyKey,
      },
    });

    if (!this.jobsService.isAsyncMode()) {
      const summary = await this.processWebhookEventNow(event.id, params.actor);
      const updated = await this.prisma.webhookEvent.findUnique({
        where: { id: event.id },
      });
      const status = updated?.status ?? summary.status;

      return {
        eventId: event.id,
        id: event.id,
        status,
        duplicate: false,
        message: summary.message,
      };
    }

    const backgroundJob = await this.prisma.backgroundJob.create({
      data: {
        type: BackgroundJobType.WEBHOOK_PROCESSING,
        status: BackgroundJobStatus.QUEUED,
        entityType: 'webhook_event',
        entityId: event.id,
        attempts: 0,
        metadataJson: {
          eventId: event.id,
          connectorId: params.connectorId,
        },
      },
    });

    await this.jobsService.enqueueProcessWebhookEventJob({
      backgroundJobId: backgroundJob.id,
      webhookEventId: event.id,
      requestedByUserId: params.actor?.sub,
      requestedByRole: params.actor?.role,
    });

    await this.auditService.log({
      action: 'webhook_event_processing_queued',
      entityType: 'webhook_event',
      entityId: event.id,
      actor: params.actor,
      metadataJson: {
        eventId: event.id,
        connectorId: params.connectorId,
        jobId: backgroundJob.id,
        attempts: 0,
      },
    });

    await this.auditService.log({
      action: 'background_job_queued',
      entityType: 'background_job',
      entityId: backgroundJob.id,
      actor: params.actor,
      metadataJson: {
        eventId: event.id,
        connectorId: params.connectorId,
        jobId: backgroundJob.id,
        status: BackgroundJobStatus.QUEUED,
        attempts: 0,
      },
    });

    return {
      eventId: event.id,
      id: event.id,
      status: event.status,
      duplicate: false,
      jobId: backgroundJob.id,
      message: 'Webhook event queued for processing.',
    };
  }

  async listEvents(query: ListWebhookEventsQueryDto, user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const statusFilter = query.status ? { status: query.status } : {};

    const where = this.isPrivileged(user.role)
      ? statusFilter
      : {
          ...statusFilter,
          connector: {
            ownerId: user.sub,
          },
        };

    const [items, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        include: {
          connector: {
            select: {
              id: true,
              name: true,
              ownerId: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeEvent(item)),
      page,
      limit,
      total,
    };
  }

  async getEventById(id: string, user: AuthenticatedUser) {
    const event = await this.getAccessibleEvent(id, user);
    return this.serializeEvent(event);
  }

  async getEventJob(id: string, user: AuthenticatedUser) {
    await this.getAccessibleEvent(id, user);
    const job = await this.prisma.backgroundJob.findFirst({
      where: {
        entityType: 'webhook_event',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new NotFoundException('Background job not found for webhook event');
    }

    return this.toPublicJob(job);
  }

  async retryEvent(id: string, user: AuthenticatedUser) {
    const event = await this.getAccessibleEvent(id, user);
    if (event.status !== WebhookEventStatus.FAILED) {
      throw new BadRequestException('Only FAILED webhook events can be retried');
    }

    return this.queueOrProcessEvent(event.id, user, true);
  }

  async processEvent(id: string, user: AuthenticatedUser) {
    const event = await this.getAccessibleEvent(id, user);
    if (event.status === WebhookEventStatus.PROCESSED || event.status === WebhookEventStatus.IGNORED) {
      throw new BadRequestException('Webhook event is already finalized');
    }

    return this.queueOrProcessEvent(event.id, user, false);
  }

  async processQueuedWebhookEvent(payload: ProcessWebhookEventJobPayload, attempts: number) {
    const backgroundJob = await this.prisma.backgroundJob.findUnique({
      where: { id: payload.backgroundJobId },
    });
    if (!backgroundJob) {
      throw new NotFoundException('Background job not found');
    }

    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: payload.webhookEventId },
    });
    if (!webhookEvent) {
      throw new NotFoundException('Webhook event not found');
    }

    const actor = this.actorFromPayload(payload);
    const startedAt = new Date();

    await this.prisma.backgroundJob.update({
      where: { id: backgroundJob.id },
      data: {
        status: BackgroundJobStatus.PROCESSING,
        startedAt,
        attempts,
      },
    });

    await this.auditService.log({
      action: 'background_job_started',
      entityType: 'background_job',
      entityId: backgroundJob.id,
      actor,
      metadataJson: {
        jobId: backgroundJob.id,
        eventId: webhookEvent.id,
        status: BackgroundJobStatus.PROCESSING,
        attempts,
      },
    });

    await this.auditService.log({
      action: 'webhook_event_processing_started',
      entityType: 'webhook_event',
      entityId: webhookEvent.id,
      actor,
      metadataJson: {
        eventId: webhookEvent.id,
        connectorId: webhookEvent.sourceConnectorRef,
        jobId: backgroundJob.id,
        attempts,
      },
    });

    try {
      const summary = await this.processWebhookEventNow(webhookEvent.id, actor);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      await this.prisma.backgroundJob.update({
        where: { id: backgroundJob.id },
        data: {
          status: BackgroundJobStatus.COMPLETED,
          finishedAt,
          durationMs,
          attempts,
          lastError: null,
          metadataJson: {
            eventId: webhookEvent.id,
            connectorId: webhookEvent.sourceConnectorRef,
            pipelineIds: summary.pipelineIds,
            syncRunIds: summary.syncRunIds,
            recordsProcessed: summary.recordsProcessed,
            recordsFailed: summary.recordsFailed,
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
          eventId: webhookEvent.id,
          status: BackgroundJobStatus.COMPLETED,
          attempts,
          durationMs,
          recordsProcessed: summary.recordsProcessed,
          recordsFailed: summary.recordsFailed,
        },
      });
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const message = this.sanitizeErrorMessage(error);

      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: WebhookEventStatus.FAILED,
          errorMessage: message,
          processedAt: finishedAt,
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
        action: 'webhook_event_processing_failed',
        entityType: 'webhook_event',
        entityId: webhookEvent.id,
        actor,
        metadataJson: {
          eventId: webhookEvent.id,
          connectorId: webhookEvent.sourceConnectorRef,
          jobId: backgroundJob.id,
          attempts,
          errorMessage: message,
        },
      });

      await this.auditService.log({
        action: 'background_job_failed',
        entityType: 'background_job',
        entityId: backgroundJob.id,
        actor,
        metadataJson: {
          jobId: backgroundJob.id,
          eventId: webhookEvent.id,
          status: BackgroundJobStatus.FAILED,
          attempts,
          durationMs,
        },
      });

      throw error;
    }
  }

  private async queueOrProcessEvent(eventId: string, user: AuthenticatedUser, isRetry: boolean) {
    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: WebhookEventStatus.RECEIVED,
        errorMessage: null,
        processedAt: null,
      },
    });

    if (!this.jobsService.isAsyncMode()) {
      const summary = await this.processWebhookEventNow(eventId, user);
      const updated = await this.prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      return {
        eventId,
        id: eventId,
        status: updated?.status ?? summary.status,
        duplicate: false,
        message: summary.message,
      };
    }

    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }

    const backgroundJob = await this.prisma.backgroundJob.create({
      data: {
        type: BackgroundJobType.WEBHOOK_PROCESSING,
        status: BackgroundJobStatus.QUEUED,
        entityType: 'webhook_event',
        entityId: event.id,
        attempts: 0,
        metadataJson: {
          eventId: event.id,
          connectorId: event.sourceConnectorRef,
          isRetry,
        },
      },
    });

    await this.jobsService.enqueueProcessWebhookEventJob({
      backgroundJobId: backgroundJob.id,
      webhookEventId: event.id,
      requestedByUserId: user.sub,
      requestedByRole: user.role,
    });

    await this.auditService.log({
      action: isRetry ? 'webhook_event_retry_queued' : 'webhook_event_processing_queued',
      entityType: 'webhook_event',
      entityId: event.id,
      actor: user,
      metadataJson: {
        eventId: event.id,
        connectorId: event.sourceConnectorRef,
        jobId: backgroundJob.id,
        attempts: 0,
      },
    });

    await this.auditService.log({
      action: 'background_job_queued',
      entityType: 'background_job',
      entityId: backgroundJob.id,
      actor: user,
      metadataJson: {
        eventId: event.id,
        connectorId: event.sourceConnectorRef,
        jobId: backgroundJob.id,
        status: BackgroundJobStatus.QUEUED,
        attempts: 0,
      },
    });

    return {
      eventId: event.id,
      id: event.id,
      status: WebhookEventStatus.RECEIVED,
      duplicate: false,
      jobId: backgroundJob.id,
      message: isRetry
        ? 'Webhook event retry queued for processing.'
        : 'Webhook event queued for processing.',
    };
  }

  private async processWebhookEventNow(eventId: string, actor?: AuditActor) {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }

    const connector = event.connectorId
      ? await this.prisma.connector.findUnique({
          where: { id: event.connectorId },
          select: { id: true, ownerId: true },
        })
      : null;

    if (!connector) {
      const updated = await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookEventStatus.FAILED,
          errorMessage: 'Connector not found for webhook event',
          processedAt: new Date(),
        },
      });

      await this.auditService.log({
        action: 'webhook_event_processing_failed',
        entityType: 'webhook_event',
        entityId: event.id,
        actor,
        metadataJson: {
          eventId: event.id,
          connectorId: event.sourceConnectorRef,
          errorMessage: updated.errorMessage,
        },
      });

      return {
        status: WebhookEventStatus.FAILED,
        pipelineIds: [],
        syncRunIds: [],
        recordsProcessed: 0,
        recordsFailed: 0,
        message: 'Webhook event failed: connector not found.',
      } as WebhookProcessingSummary;
    }

    const pipelines = await this.prisma.syncPipeline.findMany({
      where: {
        sourceConnectorId: connector.id,
        status: PipelineStatus.ACTIVE,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pipelines.length === 0) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookEventStatus.IGNORED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      await this.auditService.log({
        action: 'webhook_event_ignored',
        entityType: 'webhook_event',
        entityId: event.id,
        actor,
        metadataJson: {
          eventId: event.id,
          connectorId: connector.id,
          reason: 'no_active_pipelines',
        },
      });

      return {
        status: WebhookEventStatus.IGNORED,
        pipelineIds: [],
        syncRunIds: [],
        recordsProcessed: 0,
        recordsFailed: 0,
        message: 'Webhook event ignored: no active pipelines for connector.',
      };
    }

    const payload = this.ensureRecordObject(event.payloadJson);
    const externalId = event.idempotencyKey ?? event.id;
    const pipelineIds: string[] = [];
    const syncRunIds: string[] = [];
    let recordsProcessed = 0;
    let recordsFailed = 0;

    for (const pipeline of pipelines) {
      pipelineIds.push(pipeline.id);
      const syncRun = await this.prisma.syncRun.create({
        data: {
          pipelineId: pipeline.id,
          status: SyncRunStatus.RUNNING,
          triggerType: SyncRunTriggerType.WEBHOOK,
          recordsReceived: 0,
          recordsProcessed: 0,
          recordsFailed: 0,
          startedAt: new Date(),
        },
      });
      syncRunIds.push(syncRun.id);

      await this.auditService.log({
        action: 'sync_run_started',
        entityType: 'sync_run',
        entityId: syncRun.id,
        actor,
        metadataJson: {
          syncRunId: syncRun.id,
          pipelineId: pipeline.id,
          source: 'webhook_event',
          webhookEventId: event.id,
          triggerType: SyncRunTriggerType.WEBHOOK,
        },
      });

      const runSummary = await this.processWebhookForPipeline(
        event.id,
        pipeline.id,
        pipeline.mappingJson as Record<string, unknown>,
        payload,
        externalId,
        syncRun.id,
        actor,
      );

      recordsProcessed += runSummary.recordsProcessed;
      recordsFailed += runSummary.recordsFailed;
    }

    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    await this.auditService.log({
      action: 'webhook_event_processed',
      entityType: 'webhook_event',
      entityId: event.id,
      actor,
      metadataJson: {
        eventId: event.id,
        connectorId: connector.id,
        pipelineIds,
        syncRunIds,
        recordsProcessed,
        recordsFailed,
      },
    });

    return {
      status: WebhookEventStatus.PROCESSED,
      pipelineIds,
      syncRunIds,
      recordsProcessed,
      recordsFailed,
      message: 'Webhook event processed.',
    };
  }

  private async processWebhookForPipeline(
    eventId: string,
    pipelineId: string,
    mappingJson: Record<string, unknown>,
    payload: Record<string, unknown>,
    externalId: string,
    syncRunId: string,
    actor?: AuditActor,
  ) {
    let compiledMapping: NormalizedMappingField[];
    try {
      compiledMapping = this.transformationEngine.compileMapping(mappingJson);
    } catch (error) {
      const message =
        error instanceof MappingValidationError
          ? error.errors.map((item) => item.message).join(', ')
          : this.sanitizeErrorMessage(error);

      await this.prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: SyncRunStatus.FAILED,
          recordsReceived: 1,
          recordsProcessed: 0,
          recordsFailed: 1,
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      await this.prisma.syncPipeline.update({
        where: { id: pipelineId },
        data: {
          lastRunAt: new Date(),
        },
      });

      await this.auditService.log({
        action: 'transformation_failed',
        entityType: 'sync_run',
        entityId: syncRunId,
        actor,
        metadataJson: {
          pipelineId,
          webhookEventId: eventId,
          externalId,
          errorCount: 1,
        },
      });

      await this.auditService.log({
        action: 'sync_run_failed',
        entityType: 'sync_run',
        entityId: syncRunId,
        actor,
        metadataJson: {
          pipelineId,
          webhookEventId: eventId,
          recordsReceived: 1,
          recordsProcessed: 0,
          recordsFailed: 1,
          triggerType: SyncRunTriggerType.WEBHOOK,
        },
      });

      return {
        recordsProcessed: 0,
        recordsFailed: 1,
      };
    }

    const transformed = this.transformationEngine.transformRecordWithCompiledMapping(
      payload,
      compiledMapping,
    );

    if (transformed.errors.length > 0) {
      await this.prisma.syncRun.update({
        where: { id: syncRunId },
        data: {
          status: SyncRunStatus.FAILED,
          recordsReceived: 1,
          recordsProcessed: 0,
          recordsFailed: 1,
          errorMessage: 'One or more records failed during processing.',
          finishedAt: new Date(),
        },
      });
      await this.prisma.syncPipeline.update({
        where: { id: pipelineId },
        data: {
          lastRunAt: new Date(),
        },
      });

      await this.auditService.log({
        action: 'transformation_failed',
        entityType: 'sync_run',
        entityId: syncRunId,
        actor,
        metadataJson: {
          pipelineId,
          webhookEventId: eventId,
          externalId,
          errorCount: transformed.errors.length,
        },
      });

      await this.auditService.log({
        action: 'sync_run_failed',
        entityType: 'sync_run',
        entityId: syncRunId,
        actor,
        metadataJson: {
          pipelineId,
          webhookEventId: eventId,
          recordsReceived: 1,
          recordsProcessed: 0,
          recordsFailed: 1,
          triggerType: SyncRunTriggerType.WEBHOOK,
        },
      });

      return {
        recordsProcessed: 0,
        recordsFailed: 1,
      };
    }

    const syncedRecord = await this.prisma.syncedRecord.create({
      data: {
        pipelineId,
        syncRunId,
        externalId,
        sourceType: 'WEBHOOK',
        rawJson: payload as Prisma.InputJsonValue,
        normalizedJson: transformed.normalized as Prisma.InputJsonValue,
      },
    });

    await this.prisma.syncRun.update({
      where: { id: syncRunId },
      data: {
        status: SyncRunStatus.SUCCESS,
        recordsReceived: 1,
        recordsProcessed: 1,
        recordsFailed: 0,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
    await this.prisma.syncPipeline.update({
      where: { id: pipelineId },
      data: {
        lastRunAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'transformation_applied',
      entityType: 'sync_run',
      entityId: syncRunId,
      actor,
      metadataJson: {
        pipelineId,
        webhookEventId: eventId,
        externalId,
      },
    });

    await this.auditService.log({
      action: 'sync_run_completed',
      entityType: 'sync_run',
      entityId: syncRunId,
      actor,
        metadataJson: {
          pipelineId,
          webhookEventId: eventId,
          recordsReceived: 1,
          recordsProcessed: 1,
          recordsFailed: 0,
          triggerType: SyncRunTriggerType.WEBHOOK,
        },
      });

    await this.auditService.log({
      action: 'synced_record_created',
      entityType: 'synced_record',
      entityId: syncedRecord.id,
      actor,
      metadataJson: {
        pipelineId,
        syncRunId,
        externalId,
        sourceType: 'WEBHOOK',
      },
    });

    return {
      recordsProcessed: 1,
      recordsFailed: 0,
    };
  }

  private async getAccessibleEvent(id: string, user: AuthenticatedUser) {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        connector: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }

    if (!this.isPrivileged(user.role) && event.connector?.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this webhook event');
    }

    return event;
  }

  private actorFromPayload(payload: ProcessWebhookEventJobPayload): AuditActor {
    if (payload.requestedByUserId && payload.requestedByRole) {
      return {
        sub: payload.requestedByUserId,
        role: payload.requestedByRole,
      };
    }
    return undefined;
  }

  private getIdempotencyKey(headers: Record<string, unknown>) {
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (headerName.toLowerCase() !== 'x-syncbridge-event-id') {
        continue;
      }
      if (typeof headerValue !== 'string') {
        return null;
      }
      const normalized = headerValue.trim();
      return normalized.length > 0 ? normalized : null;
    }
    return null;
  }

  private sanitizePayload(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
    return {
      rawPayload: payload ?? null,
    };
  }

  private assertPayloadSize(payload: Record<string, unknown>) {
    const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadSize > WEBHOOK_MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException('Webhook payload exceeds allowed size');
    }
  }

  private redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(headers)) {
      const headerKey = rawKey.toLowerCase();
      if (SENSITIVE_HEADERS.has(headerKey)) {
        output[rawKey] = REDACTED_HEADER_VALUE;
        continue;
      }
      output[rawKey] = value;
    }
    return output;
  }

  private serializeEvent(event: {
    id: string;
    sourceConnectorRef: string;
    connectorId: string | null;
    idempotencyKey: string | null;
    eventType: string;
    status: WebhookEventStatus;
    payloadJson: Prisma.JsonValue;
    headersJson: Prisma.JsonValue | null;
    receivedAt: Date;
    processedAt: Date | null;
    errorMessage: string | null;
    connector?: { id: string; name: string; ownerId: string } | null;
  }) {
    const headers =
      event.headersJson && typeof event.headersJson === 'object' && !Array.isArray(event.headersJson)
        ? this.redactHeaders(event.headersJson as Record<string, unknown>)
        : null;

    return {
      ...event,
      headersJson: headers,
    };
  }

  private toPublicJob(job: {
    id: string;
    type: BackgroundJobType;
    status: BackgroundJobStatus;
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

  private ensureRecordObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
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

    return 'Webhook processing failed';
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }
}
