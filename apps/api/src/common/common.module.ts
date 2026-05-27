import { Global, Module } from '@nestjs/common';

import { StructuredLoggerService } from './logging/structured-logger.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  providers: [RequestContextService, StructuredLoggerService],
  exports: [RequestContextService, StructuredLoggerService],
})
export class CommonModule {}
