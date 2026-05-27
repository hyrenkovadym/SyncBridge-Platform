import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineStatusDto } from './dto/update-pipeline-status.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { ValidateMappingDto } from './dto/validate-mapping.dto';
import { ValidateMappingResponseDto } from './dto/validate-mapping-response.dto';
import { PipelinesService } from './pipelines.service';
import { PreviewTransformationDto } from '../transformations/dto/preview-transformation.dto';
import { TransformationPreviewResponseDto } from '../transformations/dto/transformation-preview-response.dto';

@ApiTags('pipelines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Post()
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a pipeline' })
  create(@Body() dto: CreatePipelineDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List pipelines (scope depends on role)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pipeline by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.findOne(id, user);
  }

  @Post(':id/preview')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Preview transformation results for pipeline mapping' })
  @ApiOkResponse({ type: TransformationPreviewResponseDto })
  preview(
    @Param('id') id: string,
    @Body() dto: PreviewTransformationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pipelinesService.previewTransformation(id, dto, user);
  }

  @Post('validate-mapping')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Validate mappingJson shape and safety rules' })
  @ApiOkResponse({ type: ValidateMappingResponseDto })
  validateMapping(@Body() dto: ValidateMappingDto) {
    return this.pipelinesService.validateMapping(dto.mappingJson);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update pipeline by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePipelineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pipelinesService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update pipeline status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePipelineStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pipelinesService.updateStatus(id, dto.status, user);
  }
}
