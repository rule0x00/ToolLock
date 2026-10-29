import { Module } from '@nestjs/common';
import { LockModule } from '../lock/lock.module.js';
import { CallLogService } from '../proxy/call-log.service.js';
import { ActivityController } from './activity.controller.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { HealthController } from './health.controller.js';
import { ToolsController } from './tools.controller.js';

@Module({
  imports: [LockModule],
  controllers: [HealthController, ToolsController, ActivityController],
  providers: [AdminTokenGuard, CallLogService],
})
export class AdminModule {}
