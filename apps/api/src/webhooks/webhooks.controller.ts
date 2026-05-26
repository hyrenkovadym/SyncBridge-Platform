import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { WebhookEventResponseDto } from './dto/webhook-response.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':connectorId/events')
  @ApiOperation({ summary: 'Webhook intake endpoint (Phase 1 stores raw event only)' })
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
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
  ): Promise<WebhookEventResponseDto> {
    return this.webhooksService.receiveEvent({
      connectorId,
      payload: payload ?? {},
      headers,
    });
  }
}
