import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SampleRecordDto {
  @ApiPropertyOptional({ example: 'external-record-1001' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ example: 'WEBHOOK' })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    example: {
      email: 'john@example.com',
      phone: '+1234567',
    },
  })
  @IsOptional()
  @IsObject()
  rawJson?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: {
      email: 'john@example.com',
      fullName: 'John Doe',
    },
  })
  @IsOptional()
  @IsObject()
  normalizedJson?: Record<string, unknown>;
}

export class CreateSyncRunDto {
  @ApiPropertyOptional({
    type: [SampleRecordDto],
    description: 'Optional sample records to persist during simulated sync run',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleRecordDto)
  sampleRecords?: SampleRecordDto[];
}
