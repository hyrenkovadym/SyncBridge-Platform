import { ApiProperty } from '@nestjs/swagger';
import { WebhookEventStatus } from '@prisma/client';

export class WebhookEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: WebhookEventStatus })
  status!: WebhookEventStatus;

  @ApiProperty({ required: false, default: false })
  duplicate?: boolean;
}
