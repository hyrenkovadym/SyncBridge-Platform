import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateConnectorDto {
  @ApiPropertyOptional({ example: 'Updated Connector Name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ConnectorStatus })
  @IsOptional()
  @IsEnum(ConnectorStatus)
  status?: ConnectorStatus;

  @ApiPropertyOptional({
    example: {
      endpoint: 'https://example.local/webhook/v2',
      notes: 'Credentials should be kept in a secret manager.',
    },
  })
  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;
}
