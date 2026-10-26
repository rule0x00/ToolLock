import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

// AdminTokenGuard and the /api/* controllers arrive in build step 10.
@Module({
  controllers: [HealthController],
})
export class AdminModule {}
