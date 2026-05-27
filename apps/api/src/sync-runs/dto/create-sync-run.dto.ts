import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class MockRecordDto {
  @ApiPropertyOptional({ example: 'external-record-1001' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({
    example: {
      email: 'john@example.com',
      phone: '+1234567',
    },
  })
  @IsObject()
  raw!: Record<string, unknown>;
}

export class CreateSyncRunDto {
  @ApiPropertyOptional({
    type: [MockRecordDto],
    description: 'Optional mock records to persist during the simulated sync run',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MockRecordDto)
  mockRecords?: MockRecordDto[];

  @ApiPropertyOptional({
    type: [MockRecordDto],
    description: 'Backward-compatible alias for Phase 1 sample records payload',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MockRecordDto)
  sampleRecords?: MockRecordDto[];

  @ApiPropertyOptional({
    description: 'When true, incremental cursor filtering is ignored for this run.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  ignoreCursor?: boolean;
}
