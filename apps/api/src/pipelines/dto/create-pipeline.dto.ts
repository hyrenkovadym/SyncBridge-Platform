import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePipelineDto {
  @ApiProperty({ example: 'Daily CRM Contacts Sync' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Sync contacts from CRM webhook to normalized storage' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 'connector_id_here' })
  @IsString()
  @IsNotEmpty()
  sourceConnectorId!: string;

  @ApiProperty({ example: 'internal_contacts_table' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  targetName!: string;

  @ApiProperty({
    example: {
      externalEmail: 'email',
      externalName: 'fullName',
    },
  })
  @IsObject()
  mappingJson!: Record<string, unknown>;
}
