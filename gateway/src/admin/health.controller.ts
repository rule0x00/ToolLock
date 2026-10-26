import { Controller, Get } from '@nestjs/common';

/** Unauthenticated liveness probe for the Docker healthcheck. */
@Controller('api/health')
export class HealthController {
  @Get()
  health(): { status: string } {
    return { status: 'ok' };
  }
}
