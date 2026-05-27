import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Connector, ConnectorStatus, Prisma, UserRole } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONNECTOR_SECRET_POLICY_ERROR,
  hasForbiddenConfigKeys,
} from './connector-config.policy';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

@Injectable()
export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateConnectorDto, user: AuthenticatedUser) {
    this.assertSafeConfig(dto.configJson);

    const connector = await this.prisma.connector.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        configJson: dto.configJson as Prisma.InputJsonValue,
        ownerId: user.sub,
      },
    });

    await this.auditService.log({
      action: 'connector_created',
      entityType: 'connector',
      entityId: connector.id,
      actor: user,
      metadataJson: {
        name: connector.name,
        type: connector.type,
      },
    });

    return connector;
  }

  async findAll(user: AuthenticatedUser) {
    const where = this.isPrivileged(user.role) ? {} : { ownerId: user.sub };
    return this.prisma.connector.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const connector = await this.getById(id);
    this.assertCanAccess(connector, user);
    return connector;
  }

  async update(id: string, dto: UpdateConnectorDto, user: AuthenticatedUser) {
    const connector = await this.getById(id);
    this.assertCanAccess(connector, user);

    if (dto.configJson) {
      this.assertSafeConfig(dto.configJson);
    }

    const updated = await this.prisma.connector.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.configJson ? { configJson: dto.configJson as Prisma.InputJsonValue } : {}),
      },
    });

    if (dto.status && dto.status !== connector.status) {
      await this.auditService.log({
        action: 'connector_status_updated',
        entityType: 'connector',
        entityId: connector.id,
        actor: user,
        metadataJson: {
          previousStatus: connector.status,
          nextStatus: dto.status,
        },
      });
    }

    return updated;
  }

  async updateStatus(id: string, status: ConnectorStatus, user: AuthenticatedUser) {
    const connector = await this.getById(id);
    this.assertCanAccess(connector, user);

    const updated = await this.prisma.connector.update({
      where: { id },
      data: { status },
    });

    await this.auditService.log({
      action: 'connector_status_updated',
      entityType: 'connector',
      entityId: connector.id,
      actor: user,
      metadataJson: {
        previousStatus: connector.status,
        nextStatus: status,
      },
    });

    return updated;
  }

  async getById(id: string) {
    const connector = await this.prisma.connector.findUnique({ where: { id } });
    if (!connector) {
      throw new NotFoundException('Connector not found');
    }
    return connector;
  }

  private assertCanAccess(connector: Connector, user: AuthenticatedUser) {
    if (!this.isPrivileged(user.role) && connector.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this connector');
    }
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }

  private assertSafeConfig(configJson: Record<string, unknown>) {
    if (hasForbiddenConfigKeys(configJson)) {
      throw new BadRequestException(CONNECTOR_SECRET_POLICY_ERROR);
    }
  }
}
