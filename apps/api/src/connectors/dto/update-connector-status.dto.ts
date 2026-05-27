import { ApiProperty } from '@nestjs/swagger';
import { ConnectorStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateConnectorStatusDto {
  @ApiProperty({ enum: ConnectorStatus })
  @IsEnum(ConnectorStatus)
  status!: ConnectorStatus;
}
