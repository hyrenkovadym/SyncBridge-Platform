import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type AuditActor =
  | {
      sub: string;
      role: UserRole;
    }
  | undefined;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId: string;
    metadataJson?: Prisma.InputJsonValue;
    actor?: AuditActor;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadataJson: params.metadataJson ?? {},
        actorId: params.actor?.sub ?? null,
      },
    });
  }
}
