import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateSyncRunDto } from './dto/create-sync-run.dto';
import { SyncRunsService } from './sync-runs.service';

@ApiTags('sync-runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SyncRunsController {
  constructor(private readonly syncRunsService: SyncRunsService) {}

  @Post('pipelines/:id/runs')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create simulated sync run for a pipeline' })
  create(
    @Param('id') pipelineId: string,
    @Body() dto: CreateSyncRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.syncRunsService.createForPipeline(pipelineId, dto, user);
  }

  @Get('pipelines/:id/runs')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List sync runs by pipeline' })
  listByPipeline(@Param('id') pipelineId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.syncRunsService.listByPipeline(pipelineId, user);
  }

  @Get('sync-runs/:id')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get sync run by id' })
  getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.syncRunsService.findById(id, user);
  }
}
