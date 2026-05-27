import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ListWebhookEventsQueryDto } from './dto/list-webhook-events-query.dto';
import { WebhookEventResponseDto } from './dto/webhook-response.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':connectorId/events')
  @ApiOperation({ summary: 'Webhook intake endpoint with idempotency and processing flow' })
  @ApiParam({ name: 'connectorId', description: 'Connector identifier from SyncBridge' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        eventType: 'order.created',
        payload: {
          orderId: 'A-1001',
          amount: 42.5,
        },
      },
    },
  })
  receiveEvent(
    @Param('connectorId') connectorId: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, unknown>,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<WebhookEventResponseDto> {
    return this.webhooksService.receiveEvent({
      connectorId,
      payload: payload ?? {},
      headers,
      actor: user,
    });
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List webhook events (scope depends on role)' })
  listEvents(@Query() query: ListWebhookEventsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooksService.listEvents(query, user);
  }

  @Get('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get webhook event by id' })
  getEventById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooksService.getEventById(id, user);
  }

  @Get('events/:id/job')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get latest background job by webhook event id' })
  getEventJob(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooksService.getEventJob(id, user);
  }

  @Post('events/:id/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry failed webhook event processing' })
  retryEvent(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooksService.retryEvent(id, user);
  }

  @Post('events/:id/process')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process webhook event manually' })
  processEvent(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooksService.processEvent(id, user);
  }
}
