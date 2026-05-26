import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { HealthModule } from './health/health.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { PrismaModule } from './prisma/prisma.module';
import { SyncRunsModule } from './sync-runs/sync-runs.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    ConnectorsModule,
    PipelinesModule,
    WebhooksModule,
    SyncRunsModule,
    HealthModule,
  ],
})
export class AppModule {}
