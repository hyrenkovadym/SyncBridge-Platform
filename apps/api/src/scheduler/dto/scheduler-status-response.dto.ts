import { ApiProperty } from '@nestjs/swagger';

export class SchedulerStatusResponseDto {
  @ApiProperty()
  schedulerEnabled!: boolean;

  @ApiProperty()
  processRole!: string;

  @ApiProperty()
  pollIntervalSeconds!: number;

  @ApiProperty()
  lockTtlSeconds!: number;

  @ApiProperty({ nullable: true })
  lastPollAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastPollDurationMs!: number | null;

  @ApiProperty()
  lastDuePipelines!: number;

  @ApiProperty()
  lastEnqueued!: number;

  @ApiProperty()
  lastSkipped!: number;

  @ApiProperty({ nullable: true })
  lastError!: string | null;
}
