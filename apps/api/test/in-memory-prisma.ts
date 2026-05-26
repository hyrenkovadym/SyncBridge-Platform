import { randomUUID } from 'node:crypto';

import {
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
  connectorId: string | null;
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

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function selectFields<T extends Record<string, unknown>>(entity: T, select?: Record<string, boolean>) {
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

export class InMemoryPrismaService {
  private users: UserEntity[] = [];
  private refreshTokens: RefreshTokenEntity[] = [];
  private connectors: ConnectorEntity[] = [];
  private pipelines: PipelineEntity[] = [];
  private syncRuns: SyncRunEntity[] = [];
  private syncedRecords: SyncedRecordEntity[] = [];
  private webhookEvents: WebhookEventEntity[] = [];
  private auditLogs: AuditLogEntity[] = [];

  reset() {
    this.users = [];
    this.refreshTokens = [];
    this.connectors = [];
    this.pipelines = [];
    this.syncRuns = [];
    this.syncedRecords = [];
    this.webhookEvents = [];
    this.auditLogs = [];
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
        revokedAt: null,
      };
      this.refreshTokens.push(entity);
      return cloneValue(entity);
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
    findMany: async (args: { where?: { ownerId?: string }; orderBy?: { createdAt: 'asc' | 'desc' } }) => {
      let items = [...this.connectors];
      if (args.where?.ownerId) {
        items = items.filter((item) => item.ownerId === args.where?.ownerId);
      }
      items.sort((a, b) =>
        args.orderBy?.createdAt === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
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
    findMany: async (args: { where?: { ownerId?: string }; orderBy?: { createdAt: 'asc' | 'desc' } }) => {
      let items = [...this.pipelines];
      if (args.where?.ownerId) {
        items = items.filter((item) => item.ownerId === args.where?.ownerId);
      }
      items.sort((a, b) =>
        args.orderBy?.createdAt === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
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
    findMany: async (args: { where?: { pipelineId?: string }; orderBy?: { createdAt: 'asc' | 'desc' } }) => {
      let items = [...this.syncRuns];
      if (args.where?.pipelineId) {
        items = items.filter((item) => item.pipelineId === args.where?.pipelineId);
      }
      items.sort((a, b) =>
        args.orderBy?.createdAt === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
      return cloneValue(items);
    },
    findUnique: async (args: { where: { id: string }; include?: { pipeline?: boolean } }) => {
      const entity = this.syncRuns.find((item) => item.id === args.where.id);
      if (!entity) {
        return null;
      }
      if (args.include?.pipeline) {
        const pipeline = this.pipelines.find((item) => item.id === entity.pipelineId);
        return {
          ...cloneValue(entity),
          pipeline: pipeline ? cloneValue(pipeline) : null,
        };
      }
      return cloneValue(entity);
    },
  };

  syncedRecord = {
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
  };

  webhookEvent = {
    create: async (args: { data: Partial<WebhookEventEntity> }) => {
      const entity: WebhookEventEntity = {
        id: randomUUID(),
        connectorId: (args.data.connectorId as string | null) ?? null,
        eventType: String(args.data.eventType ?? 'generic_event'),
        status: (args.data.status as WebhookEventStatus) ?? WebhookEventStatus.RECEIVED,
        payloadJson: (args.data.payloadJson as Record<string, unknown>) ?? {},
        headersJson: (args.data.headersJson as Record<string, unknown> | null) ?? null,
        receivedAt: new Date(),
        processedAt: null,
        errorMessage: null,
      };
      this.webhookEvents.push(entity);
      return cloneValue(entity);
    },
    findUnique: async (args: { where: { id: string } }) => {
      const entity = this.webhookEvents.find((item) => item.id === args.where.id);
      return entity ? cloneValue(entity) : null;
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

  async $queryRaw() {
    return [{ ok: 1 }];
  }
}
