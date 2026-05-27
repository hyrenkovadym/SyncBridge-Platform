import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InMemoryPrismaService } from './in-memory-prisma';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '4100';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://syncbridge:syncbridge@localhost:5433/syncbridge?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3001';

describe('SyncBridge API (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;

  const userOne = {
    email: 'user1@example.com',
    password: 'strongPassword123',
    fullName: 'User One',
  };

  const userTwo = {
    email: 'user2@example.com',
    password: 'strongPassword123',
    fullName: 'User Two',
  };

  beforeAll(async () => {
    const prismaMock = new InMemoryPrismaService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService) as unknown as InMemoryPrismaService;
  });

  beforeEach(() => {
    prisma.reset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/health works', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/ready works', async () => {
    const response = await request(app.getHttpServer()).get('/api/ready').expect(200);
    expect(response.body.status).toBe('ready');
  });

  it('refresh token rotates and old refresh token is rejected', async () => {
    const auth = await registerUser(app, userOne);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(201);

    expect(refreshResponse.body.accessToken).toBeDefined();
    expect(refreshResponse.body.refreshToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(401);
  });

  it('logout revokes current refresh token', async () => {
    const auth = await registerUser(app, userOne);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ refreshToken: auth.refreshToken })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(401);
  });

  it('rejects connector configJson with secret-like keys', async () => {
    const auth = await registerUser(app, userOne);

    const response = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({
        name: 'Unsafe Connector',
        type: 'WEBHOOK',
        configJson: { apiKey: 'do-not-store' },
      })
      .expect(400);

    expect(response.body.message).toContain(
      'Connector credentials must not be stored in configJson. Use a secret manager in production.',
    );
  });

  it('connector status update works for owner', async () => {
    const auth = await registerUser(app, userOne);
    const connector = await createConnector(app, auth.accessToken, {
      name: 'Status Connector',
      type: 'WEBHOOK',
      configJson: { endpoint: '/in' },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/connectors/${connector.id}/status`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ status: 'PAUSED' })
      .expect(200);

    expect(response.body.status).toBe('PAUSED');
  });

  it("user cannot update another user's connector status", async () => {
    const authOne = await registerUser(app, userOne);
    const authTwo = await registerUser(app, userTwo);

    const connector = await createConnector(app, authOne.accessToken, {
      name: 'Private Connector',
      type: 'REST_API',
      configJson: { baseUrl: 'https://api.local' },
    });

    await request(app.getHttpServer())
      .patch(`/api/connectors/${connector.id}/status`)
      .set('Authorization', `Bearer ${authTwo.accessToken}`)
      .send({ status: 'ERROR' })
      .expect(403);
  });

  it('pipeline status update works for owner', async () => {
    const auth = await registerUser(app, userOne);
    const connector = await createConnector(app, auth.accessToken, {
      name: 'Source Connector',
      type: 'DATABASE',
      configJson: { host: 'db.local' },
    });
    const pipeline = await createPipeline(app, auth.accessToken, {
      name: 'Pipeline One',
      sourceConnectorId: connector.id,
      targetName: 'contacts_target',
      mappingJson: { email: 'contact.email' },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/pipelines/${pipeline.id}/status`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    expect(response.body.status).toBe('ARCHIVED');
  });

  it("user cannot create pipeline with another user's connector", async () => {
    const authOne = await registerUser(app, userOne);
    const authTwo = await registerUser(app, userTwo);

    const connector = await createConnector(app, authOne.accessToken, {
      name: 'Private Source',
      type: 'DATABASE',
      configJson: { host: 'db.local' },
    });

    await request(app.getHttpServer())
      .post('/api/pipelines')
      .set('Authorization', `Bearer ${authTwo.accessToken}`)
      .send({
        name: 'Forbidden Pipeline',
        sourceConnectorId: connector.id,
        targetName: 'forbidden_target',
        mappingJson: { inputEmail: 'contact.email' },
      })
      .expect(403);
  });

  it('running pipeline with mockRecords creates synced records and summary counts', async () => {
    const auth = await registerUser(app, userOne);
    const connector = await createConnector(app, auth.accessToken, {
      name: 'Run Source',
      type: 'JSON_UPLOAD',
      configJson: { mode: 'test' },
    });
    const pipeline = await createPipeline(app, auth.accessToken, {
      name: 'Run Pipeline',
      sourceConnectorId: connector.id,
      targetName: 'contacts',
      mappingJson: {
        email: 'contact.email',
        name: 'contact.name',
      },
    });

    const runResponse = await request(app.getHttpServer())
      .post(`/api/pipelines/${pipeline.id}/runs`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({
        mockRecords: [
          {
            externalId: '1',
            raw: {
              email: 'test@example.com',
              name: 'Test User',
            },
          },
        ],
      })
      .expect(201);

    expect(runResponse.body.summary.recordsReceived).toBe(1);
    expect(runResponse.body.summary.recordsProcessed).toBe(1);
    expect(runResponse.body.summary.recordsFailed).toBe(0);

    const records = await prisma.syncedRecord.findMany({ where: { syncRunId: runResponse.body.id as string } });
    expect(records).toHaveLength(1);
    expect((records[0].normalizedJson as { contact?: { email?: string } }).contact?.email).toBe(
      'test@example.com',
    );
  });

  it('global sync runs listing respects ownership', async () => {
    const authOne = await registerUser(app, userOne);
    const authTwo = await registerUser(app, userTwo);

    const connectorOne = await createConnector(app, authOne.accessToken, {
      name: 'C1',
      type: 'WEBHOOK',
      configJson: { endpoint: '/c1' },
    });
    const pipelineOne = await createPipeline(app, authOne.accessToken, {
      name: 'P1',
      sourceConnectorId: connectorOne.id,
      targetName: 't1',
      mappingJson: { email: 'contact.email' },
    });

    const connectorTwo = await createConnector(app, authTwo.accessToken, {
      name: 'C2',
      type: 'WEBHOOK',
      configJson: { endpoint: '/c2' },
    });
    const pipelineTwo = await createPipeline(app, authTwo.accessToken, {
      name: 'P2',
      sourceConnectorId: connectorTwo.id,
      targetName: 't2',
      mappingJson: { email: 'contact.email' },
    });

    await request(app.getHttpServer())
      .post(`/api/pipelines/${pipelineOne.id}/runs`)
      .set('Authorization', `Bearer ${authOne.accessToken}`)
      .send({ mockRecords: [{ externalId: 'u1', raw: { email: 'u1@example.com' } }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/pipelines/${pipelineTwo.id}/runs`)
      .set('Authorization', `Bearer ${authTwo.accessToken}`)
      .send({ mockRecords: [{ externalId: 'u2', raw: { email: 'u2@example.com' } }] })
      .expect(201);

    const userOneRuns = await request(app.getHttpServer())
      .get('/api/sync-runs?page=1&limit=20')
      .set('Authorization', `Bearer ${authOne.accessToken}`)
      .expect(200);

    expect(userOneRuns.body.items).toHaveLength(1);
    expect(userOneRuns.body.items[0].pipeline.ownerId).toBe(authOne.userId);

    const operatorAuth = await createPrivilegedUser(app, prisma, {
      email: 'operator@example.com',
      password: 'strongPassword123',
      fullName: 'Operator User',
      role: UserRole.OPERATOR,
    });

    const operatorRuns = await request(app.getHttpServer())
      .get('/api/sync-runs?page=1&limit=20')
      .set('Authorization', `Bearer ${operatorAuth.accessToken}`)
      .expect(200);

    expect(operatorRuns.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('webhook intake stores event and redacts sensitive headers', async () => {
    const auth = await registerUser(app, userOne);
    const connector = await createConnector(app, auth.accessToken, {
      name: 'Webhook Connector',
      type: 'WEBHOOK',
      configJson: { endpoint: '/incoming' },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/webhooks/${connector.id}/events`)
      .set('Authorization', 'Bearer should-not-be-stored')
      .set('X-API-Key', 'secret-key-value')
      .send({ eventType: 'customer.updated', customerId: 'C-1001' })
      .expect(201);

    expect(response.body.status).toBe('RECEIVED');

    const stored = await prisma.webhookEvent.findUnique({ where: { id: response.body.id as string } });
    expect(stored).not.toBeNull();
    expect((stored?.headersJson as { authorization?: string }).authorization).toBe('REDACTED');
    expect((stored?.headersJson as { 'x-api-key'?: string })['x-api-key']).toBe('REDACTED');
  });

  it('duplicate X-SyncBridge-Event-ID is handled idempotently', async () => {
    const auth = await registerUser(app, userOne);
    const connector = await createConnector(app, auth.accessToken, {
      name: 'Webhook Connector',
      type: 'WEBHOOK',
      configJson: { endpoint: '/incoming' },
    });

    const first = await request(app.getHttpServer())
      .post(`/api/webhooks/${connector.id}/events`)
      .set('X-SyncBridge-Event-ID', 'evt-123')
      .send({ eventType: 'order.created', orderId: 'A-1001' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/webhooks/${connector.id}/events`)
      .set('X-SyncBridge-Event-ID', 'evt-123')
      .send({ eventType: 'order.created', orderId: 'A-1001' })
      .expect(201);

    expect(second.body.duplicate).toBe(true);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app.getHttpServer())
      .get('/api/webhooks/events?page=1&limit=20')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);

    expect(list.body.items).toHaveLength(1);
  });

  it('user sees only own webhook events while privileged users see all', async () => {
    const authOne = await registerUser(app, userOne);
    const authTwo = await registerUser(app, userTwo);

    const connectorOne = await createConnector(app, authOne.accessToken, {
      name: 'Webhook One',
      type: 'WEBHOOK',
      configJson: { endpoint: '/one' },
    });

    const connectorTwo = await createConnector(app, authTwo.accessToken, {
      name: 'Webhook Two',
      type: 'WEBHOOK',
      configJson: { endpoint: '/two' },
    });

    await request(app.getHttpServer())
      .post(`/api/webhooks/${connectorOne.id}/events`)
      .send({ eventType: 'one.event' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/webhooks/${connectorTwo.id}/events`)
      .send({ eventType: 'two.event' })
      .expect(201);

    const userOneList = await request(app.getHttpServer())
      .get('/api/webhooks/events?page=1&limit=20')
      .set('Authorization', `Bearer ${authOne.accessToken}`)
      .expect(200);

    expect(userOneList.body.items).toHaveLength(1);
    expect(userOneList.body.items[0].connector.name).toBe('Webhook One');

    const adminAuth = await createPrivilegedUser(app, prisma, {
      email: 'admin@example.com',
      password: 'strongPassword123',
      fullName: 'Admin User',
      role: UserRole.ADMIN,
    });

    const adminList = await request(app.getHttpServer())
      .get('/api/webhooks/events?page=1&limit=20')
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(adminList.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('dashboard summary respects ownership and privileged access', async () => {
    const authOne = await registerUser(app, userOne);
    const authTwo = await registerUser(app, userTwo);

    const connectorOne = await createConnector(app, authOne.accessToken, {
      name: 'Dash Connector 1',
      type: 'WEBHOOK',
      configJson: { endpoint: '/dash1' },
    });

    const connectorTwo = await createConnector(app, authTwo.accessToken, {
      name: 'Dash Connector 2',
      type: 'WEBHOOK',
      configJson: { endpoint: '/dash2' },
    });

    const pipelineOne = await createPipeline(app, authOne.accessToken, {
      name: 'Dash Pipeline 1',
      sourceConnectorId: connectorOne.id,
      targetName: 'target1',
      mappingJson: { email: 'contact.email' },
    });

    await request(app.getHttpServer())
      .post(`/api/pipelines/${pipelineOne.id}/runs`)
      .set('Authorization', `Bearer ${authOne.accessToken}`)
      .send({ mockRecords: [{ externalId: '1', raw: { email: 'u1@example.com' } }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/webhooks/${connectorOne.id}/events`)
      .send({ eventType: 'u1.event' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/webhooks/${connectorTwo.id}/events`)
      .send({ eventType: 'u2.event' })
      .expect(201);

    const userOneSummary = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${authOne.accessToken}`)
      .expect(200);

    expect(userOneSummary.body.connectorsCount).toBe(1);
    expect(userOneSummary.body.pipelinesCount).toBe(1);
    expect(userOneSummary.body.syncRunsCount).toBe(1);
    expect(userOneSummary.body.webhookEventsCount).toBe(1);

    const operatorAuth = await createPrivilegedUser(app, prisma, {
      email: 'ops@example.com',
      password: 'strongPassword123',
      fullName: 'Ops User',
      role: UserRole.OPERATOR,
    });

    const operatorSummary = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${operatorAuth.accessToken}`)
      .expect(200);

    expect(operatorSummary.body.connectorsCount).toBeGreaterThanOrEqual(2);
  });
});

type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

async function registerUser(
  app: INestApplication,
  payload: { email: string; password: string; fullName: string },
): Promise<AuthPayload & { userId: string }> {
  const response = await request(app.getHttpServer()).post('/api/auth/register').send(payload).expect(201);
  return {
    ...(response.body as AuthPayload),
    userId: response.body.user.id as string,
  };
}

async function loginUser(app: INestApplication, email: string, password: string): Promise<AuthPayload> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(201);
  return response.body as AuthPayload;
}

async function createPrivilegedUser(
  app: INestApplication,
  prisma: InMemoryPrismaService,
  payload: { email: string; password: string; fullName: string; role: UserRole },
): Promise<AuthPayload> {
  const auth = await registerUser(app, {
    email: payload.email,
    password: payload.password,
    fullName: payload.fullName,
  });
  await prisma.user.update({
    where: { id: auth.userId },
    data: { role: payload.role },
  });
  return loginUser(app, payload.email, payload.password);
}

async function createConnector(
  app: INestApplication,
  token: string,
  payload: {
    name: string;
    type: 'REST_API' | 'WEBHOOK' | 'CSV_UPLOAD' | 'JSON_UPLOAD' | 'DATABASE' | 'GOOGLE_SHEETS' | 'ONE_C_EXPORT' | 'MANUAL';
    configJson: Record<string, unknown>;
  },
) {
  const response = await request(app.getHttpServer())
    .post('/api/connectors')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
    .expect(201);

  return response.body as { id: string; name: string; ownerId: string; status: string };
}

async function createPipeline(
  app: INestApplication,
  token: string,
  payload: {
    name: string;
    sourceConnectorId: string;
    targetName: string;
    mappingJson: Record<string, unknown>;
  },
) {
  const response = await request(app.getHttpServer())
    .post('/api/pipelines')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
    .expect(201);

  return response.body as { id: string; name: string; sourceConnectorId: string; ownerId: string };
}
