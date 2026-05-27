import { ApiProperty } from '@nestjs/swagger';

class TransformationErrorDto {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ required: false })
  path?: string;
}

class TransformationPreviewResultDto {
  @ApiProperty({ required: false })
  externalId?: string;

  @ApiProperty({ type: Object })
  raw!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  normalized!: Record<string, unknown>;

  @ApiProperty({ type: [TransformationErrorDto] })
  errors!: TransformationErrorDto[];
}

class TransformationPreviewSummaryDto {
  @ApiProperty()
  recordsReceived!: number;

  @ApiProperty()
  recordsValid!: number;

  @ApiProperty()
  recordsInvalid!: number;
}

export class TransformationPreviewResponseDto {
  @ApiProperty()
  pipelineId!: string;

  @ApiProperty({ type: [TransformationPreviewResultDto] })
  results!: TransformationPreviewResultDto[];

  @ApiProperty({ type: TransformationPreviewSummaryDto })
  summary!: TransformationPreviewSummaryDto;
}
