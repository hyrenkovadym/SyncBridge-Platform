import { randomUUID } from 'node:crypto';

import {
  BackgroundJobStatus,
  BackgroundJobType,
  ConnectorStatus,
  ConnectorType,
  PipelineStatus,
  SyncRunStatus,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';

type UserEntity = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

type RefreshTokenEntity = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
};

type ConnectorEntity = {
  id: string;
  name: string;
  type: ConnectorType;
  status: ConnectorStatus;
  configJson: Record<string, unknown>;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

type PipelineEntity = {
  id: string;
  name: string;
  description: string | null;
  sourceConnectorId: string;
  targetName: string;
  status: PipelineStatus;
  mappingJson: Record<string, unknown>;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

type SyncRunEntity = {
  id: string;
  pipelineId: string;
  status: SyncRunStatus;
  recordsReceived: number;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

type SyncedRecordEntity = {
  id: string;
  pipelineId: string;
  externalId: string | null;
  sourceType: string;
  rawJson: Record<string, unknown>;
  normalizedJson: Record<string, unknown>;
  syncRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WebhookEventEntity = {
  id: string;
  sourceConnectorRef: string;
  connectorId: string | null;
  idempotencyKey: string | null;
  eventType: string;
  status: WebhookEventStatus;
  payloadJson: Record<string, unknown>;
  headersJson: Record<string, unknown> | null;
  receivedAt: Date;
  processedAt: Date | null;
  errorMessage: string | null;
};

type AuditLogEntity = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

type BackgroundJobEntity = {
  id: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  entityType: string;
  entityId: string;
  attempts: number;
  lastError: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
};

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function selectFields<T extends Record<string, unknown>>(
  entity: T,
  select?: Record<string, boolean>,
): Record<string, unknown> {
  if (!select) {
    return cloneValue(entity);
  }

  const output: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      output[key] = entity[key];
    }
  }
  return output;
}

function sortByDate<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T,
  direction: 'asc' | 'desc' = 'desc',
) {
  items.sort((a, b) => {
    const aValue = a[field];
    const bValue = b[field];
    const aTime = aValue instanceof Date ? aValue.getTime() : 0;
    const bTime = bValue instanceof Date ? bValue.getTime() : 0;
    return direction === 'asc' ? aTime - bTime : bTime - aTime;
  });
}

function paginate<T>(items: T[], skip?: number, take?: number) {
  const start = skip ?? 0;
  if (!take || take < 0) {
    return items.slice(start);
  }
  return items.slice(start, start + take);
}

export class InMemoryPrismaService {
  private users: UserEntity[] = [];
  private refreshTokens: RefreshTokenEntity[] = [];
  private connectors: ConnectorEntity[] = [];
  private pipelines: PipelineEntity[] = [];
  private syncRuns: SyncRunEntity[] = [];
  private syncedRecords: SyncedRecordEntity[] = [];
  private webhookEvents: WebhookEventEntity[] = [];
  private auditLogs: AuditLogEntity[] = [];
  private backgroundJobs: BackgroundJobEntity[] = [];

  reset() {
    this.users = [];
    this.refreshTokens = [];
    this.connectors = [];
    this.pipelines = [];
    this.syncRuns = [];
    this.syncedRecords = [];
    this.webhookEvents = [];
    this.auditLogs = [];
    this.backgroundJobs = [];
  }

  user = {
    findUnique: async (args: { where: { id?: string; email?: string } }) => {
      const entity = this.users.find((item) => {
        if (args.where.id) {
          return item.id === args.where.id;
        }
        if (args.where.email) {
          return item.email === args.where.email;
        }
        return false;
      });
      return entity ? cloneValue(entity) : null;
    },

    create: async (args: { data: Partial<UserEntity> }) => {
      const entity: UserEntity = {
        id: randomUUID(),
        email: String(args.data.email),
        passwordHash: String(args.data.passwordHash),
        fullName: String(args.data.fullName),
        role: (args.data.role as UserRole) ?? UserRole.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(entity);
      return cloneValue(entity);
    },

    update: async (args: { where: { id: string }; data: Partial<UserEntity> }) => {
      const index = this.users.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('User not found');
      }

      const updated: UserEntity = {
        ...this.users[index],
        ...args.data,
        updatedAt: new Date(),
      };
      this.users[index] = updated;
      return cloneValue(updated);
    },
  };

  refreshToken = {
    create: async (args: { data: Partial<RefreshTokenEntity> }) => {
      const entity: RefreshTokenEntity = {
        id: randomUUID(),
        userId: String(args.data.userId),
        tokenHash: String(args.data.tokenHash),
        expiresAt: (args.data.expiresAt as Date) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        revokedAt: (args.data.revokedAt as Date | null) ?? null,
      };
      this.refreshTokens.push(entity);
      return cloneValue(entity);
    },

    findMany: async (args: {
      where?: {
        userId?: string;
        revokedAt?: Date | null;
        expiresAt?: { gt?: Date };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }) => {
      let items = [...this.refreshTokens];
      if (args.where?.userId) {
        items = items.filter((item) => item.userId === args.where?.userId);
      }
      if (Object.prototype.hasOwnProperty.call(args.where ?? {}, 'revokedAt')) {
        items = items.filter((item) => item.revokedAt === args.where?.revokedAt);
      }
      const expiresAfter = args.where?.expiresAt?.gt;
      if (expiresAfter) {
        items = items.filter((item) => item.expiresAt > expiresAfter);
      }
      sortByDate(items, 'createdAt', args.orderBy?.createdAt ?? 'desc');
      if (args.take !== undefined) {
        items = items.slice(0, args.take);
      }
      return cloneValue(items);
    },

    update: async (args: { where: { id: string }; data: Partial<RefreshTokenEntity> }) => {
      const index = this.refreshTokens.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('Refresh token not found');
      }
      const updated: RefreshTokenEntity = {
        ...this.refreshTokens[index],
        ...args.data,
      };
      this.refreshTokens[index] = updated;
      return cloneValue(updated);
    },

    findUnique: async (args: { where: { id: string } }) => {
      const entity = this.refreshTokens.find((item) => item.id === args.where.id);
      return entity ? cloneValue(entity) : null;
    },
  };

  connector = {
    create: async (args: { data: Partial<ConnectorEntity> }) => {
      const entity: ConnectorEntity = {
        id: randomUUID(),
        name: String(args.data.name),
        type: (args.data.type as ConnectorType) ?? ConnectorType.MANUAL,
        status: (args.data.status as ConnectorStatus) ?? ConnectorStatus.ACTIVE,
        configJson: (args.data.configJson as Record<string, unknown>) ?? {},
        ownerId: String(args.data.ownerId),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.connectors.push(entity);
      return cloneValue(entity);
    },

    findMany: async (args: {
      where?: { ownerId?: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
      select?: Record<string, boolean>;
    }) => {
      let items = [...this.connectors];
      if (args.where?.ownerId) {
        items = items.filter((item) => item.ownerId === args.where?.ownerId);
      }
      sortByDate(items, 'createdAt', args.orderBy?.createdAt ?? 'desc');

      if (args.select) {
        return items.map((item) => selectFields(item, args.select));
      }

      return cloneValue(items);
    },

    findUnique: async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      const entity = this.connectors.find((item) => item.id === args.where.id);
      if (!entity) {
        return null;
      }
      return selectFields(entity, args.select);
    },

    update: async (args: { where: { id: string }; data: Partial<ConnectorEntity> }) => {
      const index = this.connectors.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('Connector not found');
      }
      const updated: ConnectorEntity = {
        ...this.connectors[index],
        ...args.data,
        updatedAt: new Date(),
      };
      this.connectors[index] = updated;
      return cloneValue(updated);
    },

    count: async (args?: { where?: { ownerId?: string } }) => {
      if (!args?.where?.ownerId) {
        return this.connectors.length;
      }
      return this.connectors.filter((item) => item.ownerId === args.where?.ownerId).length;
    },
  };

  syncPipeline = {
    create: async (args: { data: Partial<PipelineEntity> }) => {
      const entity: PipelineEntity = {
        id: randomUUID(),
        name: String(args.data.name),
        description: (args.data.description as string | null) ?? null,
        sourceConnectorId: String(args.data.sourceConnectorId),
        targetName: String(args.data.targetName),
        status: (args.data.status as PipelineStatus) ?? PipelineStatus.ACTIVE,
        mappingJson: (args.data.mappingJson as Record<string, unknown>) ?? {},
        ownerId: String(args.data.ownerId),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.pipelines.push(entity);
      return cloneValue(entity);
    },

    findMany: async (args: {
      where?: { ownerId?: string; sourceConnectorId?: string; status?: PipelineStatus };
      orderBy?: { createdAt: 'asc' | 'desc' };
      select?: Record<string, boolean>;
    }) => {
      let items = [...this.pipelines];
      if (args.where?.ownerId) {
        items = items.filter((item) => item.ownerId === args.where?.ownerId);
      }
      if (args.where?.sourceConnectorId) {
        items = items.filter((item) => item.sourceConnectorId === args.where?.sourceConnectorId);
      }
      if (args.where?.status) {
        items = items.filter((item) => item.status === args.where?.status);
      }
      sortByDate(items, 'createdAt', args.orderBy?.createdAt ?? 'desc');
      if (args.select) {
        return items.map((item) => selectFields(item, args.select));
      }
      return cloneValue(items);
    },

    findUnique: async (args: { where: { id: string } }) => {
      const entity = this.pipelines.find((item) => item.id === args.where.id);
      return entity ? cloneValue(entity) : null;
    },

    update: async (args: { where: { id: string }; data: Partial<PipelineEntity> }) => {
      const index = this.pipelines.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('Pipeline not found');
      }
      const updated: PipelineEntity = {
        ...this.pipelines[index],
        ...args.data,
        updatedAt: new Date(),
      };
      this.pipelines[index] = updated;
      return cloneValue(updated);
    },

    count: async (args?: { where?: { ownerId?: string } }) => {
      if (!args?.where?.ownerId) {
        return this.pipelines.length;
      }
      return this.pipelines.filter((item) => item.ownerId === args.where?.ownerId).length;
    },
  };

  syncRun = {
    create: async (args: { data: Partial<SyncRunEntity> }) => {
      const entity: SyncRunEntity = {
        id: randomUUID(),
        pipelineId: String(args.data.pipelineId),
        status: (args.data.status as SyncRunStatus) ?? SyncRunStatus.QUEUED,
        recordsReceived: Number(args.data.recordsReceived ?? 0),
        recordsProcessed: Number(args.data.recordsProcessed ?? 0),
        recordsFailed: Number(args.data.recordsFailed ?? 0),
        errorMessage: (args.data.errorMessage as string | null) ?? null,
        startedAt: (args.data.startedAt as Date | null) ?? null,
        finishedAt: (args.data.finishedAt as Date | null) ?? null,
        createdAt: new Date(),
      };
      this.syncRuns.push(entity);
      return cloneValue(entity);
    },

    update: async (args: { where: { id: string }; data: Partial<SyncRunEntity> }) => {
      const index = this.syncRuns.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('Sync run not found');
      }
      const updated: SyncRunEntity = {
        ...this.syncRuns[index],
        ...args.data,
      };
      this.syncRuns[index] = updated;
      return cloneValue(updated);
    },

    findMany: async (args: {
      where?: {
        pipelineId?: string | { in: string[] };
        status?: SyncRunStatus;
      };
      include?: {
        pipeline?:
          | boolean
          | {
              select?: Record<string, boolean>;
            };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    }) => {
      let items = [...this.syncRuns];
      const pipelineIdFilter = args.where?.pipelineId;

      if (typeof pipelineIdFilter === 'string') {
        items = items.filter((item) => item.pipelineId === pipelineIdFilter);
      } else if (pipelineIdFilter && Array.isArray(pipelineIdFilter.in)) {
        items = items.filter((item) => pipelineIdFilter.in.includes(item.pipelineId));
      }

      if (args.where?.status) {
        items = items.filter((item) => item.status === args.where?.status);
      }

      sortByDate(items, 'createdAt', args.orderBy?.createdAt ?? 'desc');
      items = paginate(items, args.skip, args.take);

      return items.map((item) => {
        const cloned = cloneValue(item) as Record<string, unknown>;

        if (args.include?.pipeline) {
          const pipeline = this.pipelines.find((entry) => entry.id === item.pipelineId);
          if (args.include.pipeline === true) {
            cloned.pipeline = pipeline ? cloneValue(pipeline) : null;
          } else if (args.include.pipeline.select) {
            cloned.pipeline = pipeline ? selectFields(pipeline, args.include.pipeline.select) : null;
          } else {
            cloned.pipeline = pipeline ? cloneValue(pipeline) : null;
          }
        }

        return cloned;
      });
    },

    findUnique: async (args: {
      where: { id: string };
      include?: {
        pipeline?: boolean;
      };
    }) => {
      const entity = this.syncRuns.find((item) => item.id === args.where.id);
      if (!entity) {
        return null;
      }

      const output = cloneValue(entity) as Record<string, unknown>;
      if (args.include?.pipeline) {
        const pipeline = this.pipelines.find((item) => item.id === entity.pipelineId);
        output.pipeline = pipeline ? cloneValue(pipeline) : null;
      }

      return output;
    },

    count: async (args?: {
      where?: {
        pipelineId?: string | { in: string[] };
        status?: SyncRunStatus;
        id?: string;
      };
    }) => {
      let items = [...this.syncRuns];
      const pipelineIdFilter = args?.where?.pipelineId;

      if (typeof pipelineIdFilter === 'string') {
        items = items.filter((item) => item.pipelineId === pipelineIdFilter);
      } else if (pipelineIdFilter && Array.isArray(pipelineIdFilter.in)) {
        items = items.filter((item) => pipelineIdFilter.in.includes(item.pipelineId));
      }

      if (args?.where?.status) {
        items = items.filter((item) => item.status === args.where?.status);
      }

      if (args?.where?.id) {
        items = items.filter((item) => item.id === args.where?.id);
      }

      return items.length;
    },
  };

  syncedRecord = {
    create: async (args: { data: Partial<SyncedRecordEntity> }) => {
      const entity: SyncedRecordEntity = {
        id: randomUUID(),
        pipelineId: String(args.data.pipelineId),
        externalId: (args.data.externalId as string | null) ?? null,
        sourceType: String(args.data.sourceType ?? 'MANUAL'),
        rawJson: (args.data.rawJson as Record<string, unknown>) ?? {},
        normalizedJson: (args.data.normalizedJson as Record<string, unknown>) ?? {},
        syncRunId: (args.data.syncRunId as string | null) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.syncedRecords.push(entity);
      return cloneValue(entity);
    },

    createMany: async (args: { data: Partial<SyncedRecordEntity>[] }) => {
      const records = args.data.map((data) => {
        const entity: SyncedRecordEntity = {
          id: randomUUID(),
          pipelineId: String(data.pipelineId),
          externalId: (data.externalId as string | null) ?? null,
          sourceType: String(data.sourceType ?? 'MANUAL'),
          rawJson: (data.rawJson as Record<string, unknown>) ?? {},
          normalizedJson: (data.normalizedJson as Record<string, unknown>) ?? {},
          syncRunId: (data.syncRunId as string | null) ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.syncedRecords.push(entity);
        return entity;
      });
      return { count: records.length };
    },

    findMany: async (args?: { where?: { syncRunId?: string; pipelineId?: string } }) => {
      let items = [...this.syncedRecords];
      if (args?.where?.syncRunId) {
        items = items.filter((item) => item.syncRunId === args.where?.syncRunId);
      }
      if (args?.where?.pipelineId) {
        items = items.filter((item) => item.pipelineId === args.where?.pipelineId);
      }
      return cloneValue(items);
    },
  };

  webhookEvent = {
    create: async (args: { data: Partial<WebhookEventEntity> }) => {
      const entity: WebhookEventEntity = {
        id: randomUUID(),
        sourceConnectorRef: String(args.data.sourceConnectorRef),
        connectorId: (args.data.connectorId as string | null) ?? null,
        idempotencyKey: (args.data.idempotencyKey as string | null) ?? null,
        eventType: String(args.data.eventType ?? 'generic_event'),
        status: (args.data.status as WebhookEventStatus) ?? WebhookEventStatus.RECEIVED,
        payloadJson: (args.data.payloadJson as Record<string, unknown>) ?? {},
        headersJson: (args.data.headersJson as Record<string, unknown> | null) ?? null,
        receivedAt: new Date(),
        processedAt: (args.data.processedAt as Date | null) ?? null,
        errorMessage: (args.data.errorMessage as string | null) ?? null,
      };
      this.webhookEvents.push(entity);
      return cloneValue(entity);
    },

    findFirst: async (args: {
      where?: {
        sourceConnectorRef?: string;
        idempotencyKey?: string;
      };
    }) => {
      const entity = this.webhookEvents.find(
        (item) =>
          (args.where?.sourceConnectorRef ? item.sourceConnectorRef === args.where.sourceConnectorRef : true) &&
          (args.where?.idempotencyKey ? item.idempotencyKey === args.where.idempotencyKey : true),
      );
      return entity ? cloneValue(entity) : null;
    },

    findUnique: async (args: {
      where: { id: string };
      include?: {
        connector?:
          | boolean
          | {
              select?: Record<string, boolean>;
            };
      };
    }) => {
      const entity = this.webhookEvents.find((item) => item.id === args.where.id);
      if (!entity) {
        return null;
      }

      const output = cloneValue(entity) as Record<string, unknown>;
      if (args.include?.connector) {
        const connector = entity.connectorId
          ? this.connectors.find((entry) => entry.id === entity.connectorId)
          : null;

        if (args.include.connector === true) {
          output.connector = connector ? cloneValue(connector) : null;
        } else if (args.include.connector.select) {
          output.connector = connector ? selectFields(connector, args.include.connector.select) : null;
        } else {
          output.connector = connector ? cloneValue(connector) : null;
        }
      }

      return output;
    },

    findMany: async (args?: {
      where?: {
        status?: WebhookEventStatus;
        connector?: {
          ownerId?: string;
        };
      };
      include?: {
        connector?:
          | boolean
          | {
              select?: Record<string, boolean>;
            };
      };
      orderBy?: { receivedAt: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    }) => {
      let items = [...this.webhookEvents];

      if (args?.where?.status) {
        items = items.filter((item) => item.status === args.where?.status);
      }

      if (args?.where?.connector?.ownerId) {
        items = items.filter((item) => {
          if (!item.connectorId) {
            return false;
          }
          const connector = this.connectors.find((entry) => entry.id === item.connectorId);
          return connector?.ownerId === args.where?.connector?.ownerId;
        });
      }

      sortByDate(items, 'receivedAt', args?.orderBy?.receivedAt ?? 'desc');
      items = paginate(items, args?.skip, args?.take);

      return items.map((item) => {
        const output = cloneValue(item) as Record<string, unknown>;
        if (args?.include?.connector) {
          const connector = item.connectorId
            ? this.connectors.find((entry) => entry.id === item.connectorId)
            : null;
          if (args.include.connector === true) {
            output.connector = connector ? cloneValue(connector) : null;
          } else if (args.include.connector.select) {
            output.connector = connector ? selectFields(connector, args.include.connector.select) : null;
          } else {
            output.connector = connector ? cloneValue(connector) : null;
          }
        }
        return output;
      });
    },

    count: async (args?: {
      where?: {
        status?: WebhookEventStatus;
        connector?: {
          ownerId?: string;
        };
      };
    }) => {
      let items = [...this.webhookEvents];

      if (args?.where?.status) {
        items = items.filter((item) => item.status === args.where?.status);
      }

      if (args?.where?.connector?.ownerId) {
        items = items.filter((item) => {
          if (!item.connectorId) {
            return false;
          }
          const connector = this.connectors.find((entry) => entry.id === item.connectorId);
          return connector?.ownerId === args.where?.connector?.ownerId;
        });
      }

      return items.length;
    },

    update: async (args: { where: { id: string }; data: Partial<WebhookEventEntity> }) => {
      const index = this.webhookEvents.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('Webhook event not found');
      }
      const updated: WebhookEventEntity = {
        ...this.webhookEvents[index],
        ...args.data,
      };
      this.webhookEvents[index] = updated;
      return cloneValue(updated);
    },
  };

  auditLog = {
    create: async (args: { data: Partial<AuditLogEntity> }) => {
      const entity: AuditLogEntity = {
        id: randomUUID(),
        actorId: (args.data.actorId as string | null) ?? null,
        action: String(args.data.action),
        entityType: String(args.data.entityType),
        entityId: String(args.data.entityId),
        metadataJson: (args.data.metadataJson as Record<string, unknown>) ?? {},
        createdAt: new Date(),
      };
      this.auditLogs.push(entity);
      return cloneValue(entity);
    },
  };

  backgroundJob = {
    create: async (args: { data: Partial<BackgroundJobEntity> }) => {
      const entity: BackgroundJobEntity = {
        id: randomUUID(),
        type: (args.data.type as BackgroundJobType) ?? BackgroundJobType.SYNC_RUN,
        status: (args.data.status as BackgroundJobStatus) ?? BackgroundJobStatus.QUEUED,
        entityType: String(args.data.entityType),
        entityId: String(args.data.entityId),
        attempts: Number(args.data.attempts ?? 0),
        lastError: (args.data.lastError as string | null) ?? null,
        metadataJson: (args.data.metadataJson as Record<string, unknown> | null) ?? null,
        createdAt: new Date(),
        startedAt: (args.data.startedAt as Date | null) ?? null,
        finishedAt: (args.data.finishedAt as Date | null) ?? null,
        durationMs: (args.data.durationMs as number | null) ?? null,
      };
      this.backgroundJobs.push(entity);
      return cloneValue(entity);
    },

    findUnique: async (args: { where: { id: string } }) => {
      const entity = this.backgroundJobs.find((item) => item.id === args.where.id);
      return entity ? cloneValue(entity) : null;
    },

    findFirst: async (args: {
      where?: { entityType?: string; entityId?: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => {
      let items = [...this.backgroundJobs];
      if (args.where?.entityType) {
        items = items.filter((item) => item.entityType === args.where?.entityType);
      }
      if (args.where?.entityId) {
        items = items.filter((item) => item.entityId === args.where?.entityId);
      }

      sortByDate(items, 'createdAt', args.orderBy?.createdAt ?? 'desc');
      return items.length > 0 ? cloneValue(items[0]) : null;
    },

    findMany: async (args?: {
      where?: { entityType?: string; entityId?: string; status?: BackgroundJobStatus };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => {
      let items = [...this.backgroundJobs];
      if (args?.where?.entityType) {
        items = items.filter((item) => item.entityType === args.where?.entityType);
      }
      if (args?.where?.entityId) {
        items = items.filter((item) => item.entityId === args.where?.entityId);
      }
      if (args?.where?.status) {
        items = items.filter((item) => item.status === args.where?.status);
      }
      sortByDate(items, 'createdAt', args?.orderBy?.createdAt ?? 'desc');
      return cloneValue(items);
    },

    update: async (args: { where: { id: string }; data: Partial<BackgroundJobEntity> }) => {
      const index = this.backgroundJobs.findIndex((item) => item.id === args.where.id);
      if (index < 0) {
        throw new Error('Background job not found');
      }
      const updated: BackgroundJobEntity = {
        ...this.backgroundJobs[index],
        ...args.data,
      };
      this.backgroundJobs[index] = updated;
      return cloneValue(updated);
    },
  };

  async $queryRaw() {
    return [{ ok: 1 }];
  }
}
