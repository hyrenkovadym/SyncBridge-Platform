import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStatus, Prisma, SyncPipeline, UserRole } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConnectorsService } from '../connectors/connectors.service';
import { PrismaService } from '../prisma/prisma.service';
import { MappingValidationError } from '../transformations/transformation-errors';
import { PreviewTransformationDto } from '../transformations/dto/preview-transformation.dto';
import { TransformationEngineService } from '../transformations/transformation-engine.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorsService: ConnectorsService,
    private readonly auditService: AuditService,
    private readonly transformationEngine: TransformationEngineService,
  ) {}

  async create(dto: CreatePipelineDto, user: AuthenticatedUser) {
    this.assertValidMapping(dto.mappingJson);

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

    if (dto.mappingJson) {
      this.assertValidMapping(dto.mappingJson);
    }

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

  async previewTransformation(
    pipelineId: string,
    dto: PreviewTransformationDto,
    user: AuthenticatedUser,
  ) {
    const pipeline = await this.findOne(pipelineId, user);
    const compiledMapping = this.compileMappingOrThrow(pipeline.mappingJson as Record<string, unknown>);
    const records = dto.records ?? [];

    const results = records.map((record) => {
      const raw = this.ensureRecordObject(record.raw);
      const transformed = this.transformationEngine.transformRecordWithCompiledMapping(raw, compiledMapping);
      return {
        externalId: record.externalId,
        raw,
        normalized: transformed.normalized,
        errors: transformed.errors,
      };
    });

    const recordsInvalid = results.filter((item) => item.errors.length > 0).length;
    const recordsValid = records.length - recordsInvalid;

    await this.auditService.log({
      action: 'transformation_preview_run',
      entityType: 'pipeline',
      entityId: pipeline.id,
      actor: user,
      metadataJson: {
        pipelineId: pipeline.id,
        recordsReceived: records.length,
        recordsValid,
        recordsInvalid,
        errorCount: results.reduce((acc, item) => acc + item.errors.length, 0),
      },
    });

    return {
      pipelineId: pipeline.id,
      results,
      summary: {
        recordsReceived: records.length,
        recordsValid,
        recordsInvalid,
      },
    };
  }

  validateMapping(mappingJson: Record<string, unknown>) {
    return this.transformationEngine.validateMapping(mappingJson);
  }

  private assertCanAccess(pipeline: SyncPipeline, user: AuthenticatedUser) {
    if (!this.isPrivileged(user.role) && pipeline.ownerId !== user.sub) {
      throw new ForbiddenException('You do not have access to this pipeline');
    }
  }

  private isPrivileged(role: UserRole) {
    return role === UserRole.OPERATOR || role === UserRole.ADMIN;
  }

  private assertValidMapping(mappingJson: Record<string, unknown>) {
    const result = this.transformationEngine.validateMapping(mappingJson);
    if (!result.valid) {
      throw new BadRequestException(result.errors);
    }
  }

  private compileMappingOrThrow(mappingJson: Record<string, unknown>) {
    try {
      return this.transformationEngine.compileMapping(mappingJson);
    } catch (error) {
      if (error instanceof MappingValidationError) {
        throw new BadRequestException(error.errors.map((item) => item.message));
      }
      throw error;
    }
  }

  private ensureRecordObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
