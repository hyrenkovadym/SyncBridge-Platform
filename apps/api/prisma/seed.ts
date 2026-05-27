import {
  ConnectorType,
  PipelineStatus,
  PrismaClient,
  SyncRunStatus,
  SyncRunTriggerType,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

async function upsertDemoUser(params: {
  email: string;
  fullName: string;
  role: UserRole;
  passwordHash: string;
}) {
  const { email, fullName, role, passwordHash } = params;

  return prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      role,
      passwordHash,
    },
    create: {
      email,
      fullName,
      role,
      passwordHash,
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const admin = await upsertDemoUser({
    email: 'admin@example.com',
    fullName: 'SyncBridge Admin',
    role: UserRole.ADMIN,
    passwordHash,
  });

  const operator = await upsertDemoUser({
    email: 'operator@example.com',
    fullName: 'SyncBridge Operator',
    role: UserRole.OPERATOR,
    passwordHash,
  });

  const user = await upsertDemoUser({
    email: 'user@example.com',
    fullName: 'SyncBridge User',
    role: UserRole.USER,
    passwordHash,
  });

  const restConnector =
    (await prisma.connector.findFirst({
      where: {
        ownerId: user.id,
        name: 'Demo CRM REST Connector',
      },
    })) ??
    (await prisma.connector.create({
      data: {
        name: 'Demo CRM REST Connector',
        type: ConnectorType.REST_API,
        configJson: {
          baseUrl: 'https://demo-crm.local/api',
          note: 'Fake demo config. Store real credentials in a secret manager.',
        },
        ownerId: user.id,
      },
    }));

  const webhookConnector =
    (await prisma.connector.findFirst({
      where: {
        ownerId: user.id,
        name: 'Demo Orders Webhook Connector',
      },
    })) ??
    (await prisma.connector.create({
      data: {
        name: 'Demo Orders Webhook Connector',
        type: ConnectorType.WEBHOOK,
        configJson: {
          sourceSystem: 'demo-store',
          description: 'Receives demo order events for portfolio walkthrough.',
        },
        ownerId: user.id,
      },
    }));

  const contactsPipeline =
    (await prisma.syncPipeline.findFirst({
      where: {
        ownerId: user.id,
        name: 'Demo Contacts Pipeline',
      },
    })) ??
    (await prisma.syncPipeline.create({
      data: {
        name: 'Demo Contacts Pipeline',
        description: 'Maps incoming contact records into normalized customer fields.',
        sourceConnectorId: restConnector.id,
        targetName: 'contacts_table',
        status: PipelineStatus.ACTIVE,
        mappingJson: {
          fields: {
            email: { path: 'contact.email', required: true, type: 'string', trim: true, lowercase: true },
            fullName: { path: 'contact.name', default: 'Unknown', type: 'string', trim: true },
            isActive: { path: 'active', default: true, type: 'boolean' },
            updatedAt: { path: 'updatedAt', type: 'date' },
          },
        },
        ownerId: user.id,
        incrementalMode: true,
        cursorJson: {
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }));

  const ordersPipeline =
    (await prisma.syncPipeline.findFirst({
      where: {
        ownerId: user.id,
        name: 'Demo Orders Webhook Pipeline',
      },
    })) ??
    (await prisma.syncPipeline.create({
      data: {
        name: 'Demo Orders Webhook Pipeline',
        description: 'Transforms webhook order payloads for downstream processing.',
        sourceConnectorId: webhookConnector.id,
        targetName: 'orders_table',
        status: PipelineStatus.ACTIVE,
        mappingJson: {
          fields: {
            orderId: { path: 'order.id', required: true, type: 'string', trim: true },
            customerEmail: { path: 'order.customer.email', required: true, type: 'string', lowercase: true },
            totalAmount: { path: 'order.total', type: 'number' },
            currency: { path: 'order.currency', default: 'USD', type: 'string', uppercase: true },
          },
        },
        ownerId: user.id,
      },
    }));

  const existingDemoRun = await prisma.syncRun.findFirst({
    where: {
      pipelineId: contactsPipeline.id,
      triggerType: SyncRunTriggerType.MANUAL,
      status: SyncRunStatus.SUCCESS,
    },
  });

  const demoRun =
    existingDemoRun ??
    (await prisma.syncRun.create({
      data: {
        pipelineId: contactsPipeline.id,
        triggerType: SyncRunTriggerType.MANUAL,
        status: SyncRunStatus.SUCCESS,
        recordsReceived: 1,
        recordsProcessed: 1,
        recordsFailed: 0,
        startedAt: new Date('2026-05-01T09:00:00.000Z'),
        finishedAt: new Date('2026-05-01T09:00:01.000Z'),
      },
    }));

  const existingDemoRecord = await prisma.syncedRecord.findFirst({
    where: {
      pipelineId: contactsPipeline.id,
      externalId: 'demo-contact-1',
    },
  });

  if (!existingDemoRecord) {
    await prisma.syncedRecord.create({
      data: {
        pipelineId: contactsPipeline.id,
        syncRunId: demoRun.id,
        sourceType: 'demo_seed',
        externalId: 'demo-contact-1',
        rawJson: {
          contact: {
            email: 'Test.User@Example.com',
            name: 'Test User',
          },
          active: true,
          updatedAt: '2026-05-01T09:00:00.000Z',
        },
        normalizedJson: {
          email: 'test.user@example.com',
          fullName: 'Test User',
          isActive: true,
          updatedAt: '2026-05-01T09:00:00.000Z',
        },
      },
    });
  }

  const existingWebhookEvent = await prisma.webhookEvent.findFirst({
    where: {
      sourceConnectorRef: webhookConnector.id,
      idempotencyKey: 'demo-webhook-evt-1',
    },
  });

  if (!existingWebhookEvent) {
    await prisma.webhookEvent.create({
      data: {
        sourceConnectorRef: webhookConnector.id,
        connectorId: webhookConnector.id,
        idempotencyKey: 'demo-webhook-evt-1',
        eventType: 'order.created',
        status: WebhookEventStatus.PROCESSED,
        payloadJson: {
          order: {
            id: 'ORDER-1001',
            customer: {
              email: 'buyer@example.com',
            },
            total: 149.95,
            currency: 'usd',
          },
        },
        headersJson: {
          'x-syncbridge-event-id': 'demo-webhook-evt-1',
          'x-source-system': 'demo-store',
          authorization: '[REDACTED]',
        },
        processedAt: new Date('2026-05-02T10:00:00.000Z'),
      },
    });
  }

  const existingFailedWebhook = await prisma.webhookEvent.findFirst({
    where: {
      sourceConnectorRef: webhookConnector.id,
      idempotencyKey: 'demo-webhook-evt-failed',
    },
  });

  if (!existingFailedWebhook) {
    await prisma.webhookEvent.create({
      data: {
        sourceConnectorRef: webhookConnector.id,
        connectorId: webhookConnector.id,
        idempotencyKey: 'demo-webhook-evt-failed',
        eventType: 'order.updated',
        status: WebhookEventStatus.FAILED,
        payloadJson: {
          order: {
            id: 'ORDER-1002',
            total: 'invalid-number',
          },
        },
        headersJson: {
          'x-syncbridge-event-id': 'demo-webhook-evt-failed',
          'x-source-system': 'demo-store',
          cookie: '[REDACTED]',
        },
        errorMessage: 'Demo validation failure: totalAmount could not be coerced to number.',
      },
    });
  }

  // Keep references for lint/no-unused safety.
  void admin;
  void operator;
  void ordersPipeline;
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });