import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JobStatusService } from './job-status.service';

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class JobsController {
  constructor(private readonly jobStatusService: JobStatusService) {}

  @Get('jobs/:id')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get background job status by id' })
  getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobStatusService.getById(id, user);
  }

  @Get('sync-runs/:id/job')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get latest background job by sync run id' })
  getBySyncRunId(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobStatusService.getBySyncRunId(id, user);
  }
}
