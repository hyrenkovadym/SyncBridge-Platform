import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStatus, Prisma, SyncPipeline, UserRole } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConnectorsService } from '../connectors/connectors.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorsService: ConnectorsService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePipelineDto, user: AuthenticatedUser) {
    const connector = await this.connectorsService.getById(dto.sourceConnectorId);
    if (!this.isPrivileged(user.role) && connector.ownerId !== user.sub) {
      throw new ForbiddenException('You can only use your own connector');
    }

    const pipeline = await this.prisma.syncPipeline.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        sourceConnectorId: dto.sourceConnectorId,
        targetName: dto.targetName.trim(),
        mappingJson: dto.mappingJson as Prisma.InputJsonValue,
        status: PipelineStatus.ACTIVE,
        ownerId: user.sub,
      },
    });

    await this.auditService.log({
      action: 'pipeline_created',
      entityType: 'pipeline',
      entityId: pipeline.id,
      actor: user,
      metadataJson: {
        name: pipeline.name,
        sourceConnectorId: pipeline.sourceConnectorId,
      },
    });

    return pipeline;
  }

  async findAll(user: AuthenticatedUser) {
    const where = this.isPrivileged(user.role) ? {} : { ownerId: user.sub };
    return this.prisma.syncPipeline.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const pipeline = await this.getById(id);
    this.assertCanAccess(pipeline, user);
    return pipeline;
  }

  async update(id: string, dto: UpdatePipelineDto, user: AuthenticatedUser) {
    const existing = await this.getById(id);
    this.assertCanAccess(existing, user);

    if (dto.sourceConnectorId) {
      const connector = await this.connectorsService.getById(dto.sourceConnectorId);
      if (!this.isPrivileged(user.role) && connector.ownerId !== user.sub) {
        throw new ForbiddenException('You can only use your own connector');
      }
    }

    const updated = await this.prisma.syncPipeline.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
        ...(dto.sourceConnectorId ? { sourceConnectorId: dto.sourceConnectorId } : {}),
        ...(dto.targetName ? { targetName: dto.targetName.trim() } : {}),
        ...(dto.mappingJson ? { mappingJson: dto.mappingJson as Prisma.InputJsonValue } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });

    if (dto.status && dto.status !== existing.status) {
      await this.auditService.log({
        action: 'pipeline_status_updated',
        entityType: 'pipeline',
        entityId: existing.id,
        actor: user,
        metadataJson: {
          previousStatus: existing.status,
          nextStatus: dto.status,
        },
      });
    }

    return updated;
  }

  async updateStatus(id: string, status: PipelineStatus, user: AuthenticatedUser) {
    const pipeline = await this.getById(id);
    this.assertCanAccess(pipeline, user);

    const updated = await this.prisma.syncPipeline.update({
      where: { id },
      data: { status },
    });

    await this.auditService.log({
      action: 'pipeline_status_updated',
      entityType: 'pipeline',
      entityId: pipeline.id,
      actor: user,
      metadataJson: {
        previousStatus: pipeline.status,
        nextStatus: status,
      },
    });

    return updated;
  }

  async getById(id: string) {
    const pipeline = await this.prisma.syncPipeline.findUnique({ where: { id } });
    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }
    return pipeline;
  }

  private assertCanAccess(pipeline: SyncPipeline, user: AuthenticatedUser) {
    if (!this.isPrivileged(user.role) && pipeline.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this pipeline');
    }
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }
}
