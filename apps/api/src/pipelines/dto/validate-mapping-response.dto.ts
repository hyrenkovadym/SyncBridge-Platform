import { ApiProperty } from '@nestjs/swagger';

export class ValidateMappingResponseDto {
  @ApiProperty()
  valid!: boolean;

  @ApiProperty({ type: [String] })
  errors!: string[];
}
