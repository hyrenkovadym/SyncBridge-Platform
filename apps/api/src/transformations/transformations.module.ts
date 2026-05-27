import { Module } from '@nestjs/common';

import { TransformationEngineService } from './transformation-engine.service';

@Module({
  providers: [TransformationEngineService],
  exports: [TransformationEngineService],
})
export class TransformationsModule {}
