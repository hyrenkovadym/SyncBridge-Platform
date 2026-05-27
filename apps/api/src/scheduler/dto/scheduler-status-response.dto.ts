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
}
