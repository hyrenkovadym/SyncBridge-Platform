import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class PreviewRecordDto {
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  raw!: Record<string, unknown>;
}

export class PreviewTransformationDto {
  @ApiProperty({ type: [PreviewRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviewRecordDto)
  records!: PreviewRecordDto[];
}
