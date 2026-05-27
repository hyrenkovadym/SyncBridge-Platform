import { ApiProperty } from '@nestjs/swagger';
import { WebhookEventStatus } from '@prisma/client';

export class WebhookEventResponseDto {
  @ApiProperty()
  eventId!: string;

  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: WebhookEventStatus })
  status!: WebhookEventStatus;

  @ApiProperty({ required: false, default: false })
  duplicate?: boolean;

  @ApiProperty({ required: false, nullable: true })
  jobId?: string | null;

  @ApiProperty({ required: false })
  message?: string;
}
