import { ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePipelineDto {
  @ApiPropertyOptional({ example: 'Updated Pipeline Name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated details about the pipeline' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'connector_id_here' })
  @IsOptional()
  @IsString()
  sourceConnectorId?: string;

  @ApiPropertyOptional({ example: 'new_target_name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  targetName?: string;

  @ApiPropertyOptional({
    example: {
      fields: {
        isActive: {
          path: 'active',
          type: 'boolean',
          default: true,
        },
      },
    },
  })
  @IsOptional()
  @IsObject()
  mappingJson?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: PipelineStatus })
  @IsOptional()
  @IsEnum(PipelineStatus)
  status?: PipelineStatus;
}
