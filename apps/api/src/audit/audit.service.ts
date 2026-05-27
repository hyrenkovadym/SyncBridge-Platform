import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../prisma/prisma.service';

export type AuditActor =
  | {
      sub: string;
      role: UserRole;
    }
  | undefined;

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId: string;
    metadataJson?: Prisma.InputJsonValue;
    actor?: AuditActor;
  }) {
    const requestId = this.requestContext.getRequestId();
    const metadata = this.mergeRequestContext(params.metadataJson, requestId);

    return this.prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadataJson: metadata,
        actorId: params.actor?.sub ?? null,
      },
    });
  }

  private mergeRequestContext(metadataJson: Prisma.InputJsonValue | undefined, requestId?: string) {
    const safeBase =
      metadataJson && typeof metadataJson === 'object' && !Array.isArray(metadataJson)
        ? ({ ...(metadataJson as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    if (requestId) {
      safeBase.requestId = requestId;
    }

    return safeBase as Prisma.InputJsonValue;
  }
}
