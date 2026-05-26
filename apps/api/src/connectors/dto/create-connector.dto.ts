import { ApiProperty } from '@nestjs/swagger';
import { ConnectorType } from '@prisma/client';
import { IsEnum, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConnectorDto {
  @ApiProperty({ example: 'Primary CRM Webhook Connector' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ConnectorType, example: ConnectorType.WEBHOOK })
  @IsEnum(ConnectorType)
  type!: ConnectorType;

  @ApiProperty({
    example: {
      endpoint: 'https://example.local/webhook',
      notes: 'Do not store production secrets in configJson.',
    },
  })
  @IsObject()
  configJson!: Record<string, unknown>;
}
