import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Simple health check endpoint' })
  health() {
    return this.healthService.health();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check with database probe' })
  ready() {
    return this.healthService.ready();
  }
}
