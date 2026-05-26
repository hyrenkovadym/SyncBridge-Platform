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

  beforeEach(async () => {
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
    expect(response.body.service).toBe('syncbridge-api');
  });

  it('GET /api/ready works', async () => {
    const response = await request(app.getHttpServer()).get('/api/ready').expect(200);
    expect(response.body.status).toBe('ready');
    expect(response.body.database).toBe('up');
  });

  it('user can register', async () => {
    const response = await request(app.getHttpServer()).post('/api/auth/register').send(userOne).expect(201);
    expect(response.body.user.email).toBe(userOne.email);
    expect(response.body.accessToken).toBeDefined();
  });

  it('user can login', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(userOne).expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: userOne.email, password: userOne.password })
      .expect(201);

    expect(response.body.user.email).toBe(userOne.email);
    expect(response.body.accessToken).toBeDefined();
  });

  it('authenticated user can create connector', async () => {
    const token = await registerAndGetToken(app, userOne);

    const response = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'User Connector',
        type: 'WEBHOOK',
        configJson: { endpoint: 'https://example.test/webhook' },
      })
      .expect(201);

    expect(response.body.name).toBe('User Connector');
    expect(response.body.ownerId).toBeDefined();
  });

  it('user sees only own connectors', async () => {
    const tokenOne = await registerAndGetToken(app, userOne);
    const tokenTwo = await registerAndGetToken(app, userTwo);

    await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        name: 'Connector A',
        type: 'WEBHOOK',
        configJson: { env: 'a' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({
        name: 'Connector B',
        type: 'REST_API',
        configJson: { env: 'b' },
      })
      .expect(201);

    const userOneList = await request(app.getHttpServer())
      .get('/api/connectors')
      .set('Authorization', `Bearer ${tokenOne}`)
      .expect(200);

    expect(userOneList.body).toHaveLength(1);
    expect(userOneList.body[0].name).toBe('Connector A');
  });

  it('authenticated user can create pipeline using own connector', async () => {
    const token = await registerAndGetToken(app, userOne);

    const connectorResponse = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pipeline Source Connector',
        type: 'REST_API',
        configJson: { baseUrl: 'https://example.local' },
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/pipelines')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pipeline 1',
        sourceConnectorId: connectorResponse.body.id,
        targetName: 'contacts_target',
        mappingJson: { externalName: 'fullName' },
      })
      .expect(201);

    expect(response.body.name).toBe('Pipeline 1');
    expect(response.body.sourceConnectorId).toBe(connectorResponse.body.id);
  });

  it("user cannot create pipeline using another user's connector", async () => {
    const tokenOne = await registerAndGetToken(app, userOne);
    const tokenTwo = await registerAndGetToken(app, userTwo);

    const connectorResponse = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        name: 'Private Connector',
        type: 'DATABASE',
        configJson: { host: 'db.local' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/pipelines')
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({
        name: 'Unauthorized Pipeline',
        sourceConnectorId: connectorResponse.body.id,
        targetName: 'forbidden_target',
        mappingJson: { source: 'target' },
      })
      .expect(403);
  });

  it('webhook event intake stores event', async () => {
    const token = await registerAndGetToken(app, userOne);

    const connectorResponse = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Webhook Connector',
        type: 'WEBHOOK',
        configJson: { endpoint: '/incoming' },
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/webhooks/${connectorResponse.body.id}/events`)
      .send({
        eventType: 'customer.updated',
        customerId: 'C-1001',
      })
      .expect(201);

    expect(response.body.status).toBe('RECEIVED');

    const storedEvent = await prisma.webhookEvent.findUnique({
      where: { id: response.body.id as string },
    });
    expect(storedEvent).not.toBeNull();
    expect(storedEvent?.eventType).toBe('customer.updated');
  });

  it('sync run can be created for own pipeline', async () => {
    const token = await registerAndGetToken(app, userOne);

    const connectorResponse = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Run Connector',
        type: 'JSON_UPLOAD',
        configJson: { mode: 'test' },
      })
      .expect(201);

    const pipelineResponse = await request(app.getHttpServer())
      .post('/api/pipelines')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Run Pipeline',
        sourceConnectorId: connectorResponse.body.id,
        targetName: 'sync_target',
        mappingJson: { in: 'out' },
      })
      .expect(201);

    const runResponse = await request(app.getHttpServer())
      .post(`/api/pipelines/${pipelineResponse.body.id}/runs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sampleRecords: [
          {
            externalId: 'rec-1',
            sourceType: 'WEBHOOK',
            rawJson: { a: 1 },
            normalizedJson: { a: 1 },
          },
        ],
      })
      .expect(201);

    expect(runResponse.body.status).toBe('SUCCESS');
    expect(runResponse.body.recordsProcessed).toBeGreaterThanOrEqual(1);
  });

  it('admin can see all connectors and pipelines', async () => {
    const tokenOne = await registerAndGetToken(app, userOne);
    const tokenTwo = await registerAndGetToken(app, userTwo);
    await registerAndGetToken(app, {
      email: 'admin@example.com',
      password: 'strongPassword123',
      fullName: 'Admin User',
    });

    const admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    if (!admin) {
      throw new Error('Admin user not found in test setup');
    }
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: UserRole.ADMIN },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'strongPassword123' })
      .expect(201);
    const adminToken = adminLogin.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        name: 'U1 Connector',
        type: 'WEBHOOK',
        configJson: { owner: 'u1' },
      })
      .expect(201);

    const userTwoConnector = await request(app.getHttpServer())
      .post('/api/connectors')
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({
        name: 'U2 Connector',
        type: 'REST_API',
        configJson: { owner: 'u2' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/pipelines')
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({
        name: 'U2 Pipeline',
        sourceConnectorId: userTwoConnector.body.id,
        targetName: 'u2_target',
        mappingJson: { input: 'output' },
      })
      .expect(201);

    const connectorsList = await request(app.getHttpServer())
      .get('/api/connectors')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(connectorsList.body.length).toBeGreaterThanOrEqual(2);

    const pipelinesList = await request(app.getHttpServer())
      .get('/api/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(pipelinesList.body.length).toBeGreaterThanOrEqual(1);
  });
});

async function registerAndGetToken(
  app: INestApplication,
  payload: { email: string; password: string; fullName: string },
) {
  const response = await request(app.getHttpServer()).post('/api/auth/register').send(payload).expect(201);

  return response.body.accessToken as string;
}
