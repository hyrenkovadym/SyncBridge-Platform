import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class ValidateMappingDto {
  @ApiProperty({ type: Object })
  @IsObject()
  mappingJson!: Record<string, unknown>;
}
