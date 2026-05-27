import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SchedulerStatusResponseDto } from './dto/scheduler-status-response.dto';
import { UpdatePipelineScheduleDto } from './dto/update-pipeline-schedule.dto';
import { SchedulerService } from './scheduler.service';

@ApiTags('scheduler')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Patch('pipelines/:id/schedule')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update pipeline schedule configuration' })
  updatePipelineSchedule(
    @Param('id') pipelineId: string,
    @Body() dto: UpdatePipelineScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedulerService.updatePipelineSchedule(pipelineId, dto, user);
  }

  @Get('pipelines/:id/schedule')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pipeline schedule configuration' })
  getPipelineSchedule(@Param('id') pipelineId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulerService.getPipelineSchedule(pipelineId, user);
  }

  @Post('pipelines/:id/schedule/trigger')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Trigger scheduled sync run for pipeline' })
  triggerPipelineSchedule(@Param('id') pipelineId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulerService.triggerPipelineSchedule(pipelineId, user);
  }

  @Get('scheduler/status')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scheduler runtime status' })
  @ApiOkResponse({ type: SchedulerStatusResponseDto })
  getSchedulerStatus() {
    return this.schedulerService.getSchedulerStatus();
  }
}
