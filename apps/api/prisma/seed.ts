import { ConnectorType, PipelineStatus, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const defaultPasswordHash = await bcrypt.hash('ChangeMe123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@syncbridge.local' },
    update: {},
    create: {
      email: 'admin@syncbridge.local',
      fullName: 'SyncBridge Admin',
      role: UserRole.ADMIN,
      passwordHash: defaultPasswordHash,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: 'operator@syncbridge.local' },
    update: {},
    create: {
      email: 'operator@syncbridge.local',
      fullName: 'SyncBridge Operator',
      role: UserRole.OPERATOR,
      passwordHash: defaultPasswordHash,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@syncbridge.local' },
    update: {},
    create: {
      email: 'user@syncbridge.local',
      fullName: 'SyncBridge User',
      role: UserRole.USER,
      passwordHash: defaultPasswordHash,
    },
  });

  const existingConnector = await prisma.connector.findFirst({
    where: {
      ownerId: user.id,
      name: 'Sample REST Connector',
    },
  });

  const connector =
    existingConnector ??
    (await prisma.connector.create({
      data: {
        name: 'Sample REST Connector',
        type: ConnectorType.REST_API,
        configJson: {
          baseUrl: 'https://example.local/api',
          note: 'Demo seed connector. Store real credentials in a secret manager.',
        },
        ownerId: user.id,
      },
    }));

  const existingPipeline = await prisma.syncPipeline.findFirst({
    where: {
      ownerId: user.id,
      name: 'Sample Contacts Pipeline',
    },
  });

  if (!existingPipeline) {
    await prisma.syncPipeline.create({
      data: {
        name: 'Sample Contacts Pipeline',
        description: 'Sample Phase 1 seeded pipeline',
        sourceConnectorId: connector.id,
        targetName: 'contacts_table',
        status: PipelineStatus.ACTIVE,
        mappingJson: {
          externalEmail: 'email',
          externalName: 'fullName',
        },
        ownerId: user.id,
      },
    });
  }

  // keep references alive to avoid lint warnings about unused seed entities
  void admin;
  void operator;
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
