import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma, UserRole, WebhookEventStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ListWebhookEventsQueryDto } from './dto/list-webhook-events-query.dto';

const WEBHOOK_MAX_PAYLOAD_BYTES = 250 * 1024;
const REDACTED_HEADER_VALUE = 'REDACTED';
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-auth-token']);

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async receiveEvent(params: {
    connectorId: string;
    payload: unknown;
    headers: Record<string, unknown>;
    actor?: AuthenticatedUser;
  }) {
    const sanitizedPayload = this.sanitizePayload(params.payload);
    this.assertPayloadSize(sanitizedPayload);
    const redactedHeaders = this.redactHeaders(params.headers);
    const idempotencyKey = this.getIdempotencyKey(params.headers);

    if (idempotencyKey) {
      const existingEvent = await this.prisma.webhookEvent.findFirst({
        where: {
          sourceConnectorRef: params.connectorId,
          idempotencyKey,
        },
      });

      if (existingEvent) {
        await this.auditService.log({
          action: 'webhook_event_duplicate_ignored',
          entityType: 'webhook_event',
          entityId: existingEvent.id,
          actor: params.actor,
          metadataJson: {
            connectorId: params.connectorId,
            idempotencyKey,
          },
        });

        return {
          id: existingEvent.id,
          status: existingEvent.status,
          duplicate: true,
        };
      }
    }

    const connector = await this.prisma.connector.findUnique({
      where: { id: params.connectorId },
      select: { id: true },
    });

    const eventType =
      typeof sanitizedPayload.eventType === 'string' && sanitizedPayload.eventType.trim().length > 0
        ? sanitizedPayload.eventType.trim()
        : 'generic_event';

    const event = await this.prisma.webhookEvent.create({
      data: {
        sourceConnectorRef: params.connectorId,
        connectorId: connector?.id ?? null,
        idempotencyKey,
        eventType,
        status: WebhookEventStatus.RECEIVED,
        payloadJson: sanitizedPayload as Prisma.InputJsonValue,
        headersJson: redactedHeaders as Prisma.InputJsonValue,
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
        idempotencyKey,
      },
    });

    return {
      id: event.id,
      status: event.status,
      duplicate: false,
    };
  }

  async listEvents(query: ListWebhookEventsQueryDto, user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const statusFilter = query.status ? { status: query.status } : {};

    const where = this.isPrivileged(user.role)
      ? statusFilter
      : {
          ...statusFilter,
          connector: {
            ownerId: user.sub,
          },
        };

    const [items, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        include: {
          connector: {
            select: {
              id: true,
              name: true,
              ownerId: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeEvent(item)),
      page,
      limit,
      total,
    };
  }

  async getEventById(id: string, user: AuthenticatedUser) {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        connector: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }

    if (!this.isPrivileged(user.role) && event.connector?.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this webhook event');
    }

    return this.serializeEvent(event);
  }

  private getIdempotencyKey(headers: Record<string, unknown>) {
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (headerName.toLowerCase() !== 'x-syncbridge-event-id') {
        continue;
      }
      if (typeof headerValue !== 'string') {
        return null;
      }
      const normalized = headerValue.trim();
      return normalized.length > 0 ? normalized : null;
    }
    return null;
  }

  private sanitizePayload(payload: unknown): Record<string, unknown> {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
    return {
      rawPayload: payload ?? null,
    };
  }

  private assertPayloadSize(payload: Record<string, unknown>) {
    const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadSize > WEBHOOK_MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException('Webhook payload exceeds allowed size');
    }
  }

  private redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(headers)) {
      const headerKey = rawKey.toLowerCase();
      if (SENSITIVE_HEADERS.has(headerKey)) {
        output[rawKey] = REDACTED_HEADER_VALUE;
        continue;
      }
      output[rawKey] = value;
    }
    return output;
  }

  private serializeEvent(event: {
    id: string;
    sourceConnectorRef: string;
    connectorId: string | null;
    idempotencyKey: string | null;
    eventType: string;
    status: WebhookEventStatus;
    payloadJson: Prisma.JsonValue;
    headersJson: Prisma.JsonValue | null;
    receivedAt: Date;
    processedAt: Date | null;
    errorMessage: string | null;
    connector?: { id: string; name: string; ownerId: string } | null;
  }) {
    const headers =
      event.headersJson && typeof event.headersJson === 'object' && !Array.isArray(event.headersJson)
        ? this.redactHeaders(event.headersJson as Record<string, unknown>)
        : null;

    return {
      ...event,
      headersJson: headers,
    };
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }
}
