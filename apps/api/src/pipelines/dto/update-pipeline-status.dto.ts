import { ApiProperty } from '@nestjs/swagger';
import { PipelineStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePipelineStatusDto {
  @ApiProperty({ enum: PipelineStatus })
  @IsEnum(PipelineStatus)
  status!: PipelineStatus;
}
