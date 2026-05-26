import { Injectable } from '@nestjs/common';
import { Prisma, WebhookEventStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async receiveEvent(params: {
    connectorId: string;
    payload: Record<string, unknown>;
    headers: Record<string, unknown>;
    actor?: AuthenticatedUser;
  }) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: params.connectorId },
      select: { id: true },
    });

    const eventType =
      typeof params.payload.eventType === 'string' && params.payload.eventType.trim().length > 0
        ? params.payload.eventType.trim()
        : 'generic_event';

    const event = await this.prisma.webhookEvent.create({
      data: {
        connectorId: connector?.id ?? null,
        eventType,
        status: WebhookEventStatus.RECEIVED,
        payloadJson: params.payload as Prisma.InputJsonValue,
        headersJson: params.headers as Prisma.InputJsonValue,
      },
    });

    await this.auditService.log({
      action: 'webhook_event_received',
      entityType: 'webhook_event',
      entityId: event.id,
      actor: params.actor,
      metadataJson: {
        connectorId: params.connectorId,
        storedConnectorId: event.connectorId,
        eventType: event.eventType,
      },
    });

    return {
      id: event.id,
      status: event.status,
    };
  }
}
