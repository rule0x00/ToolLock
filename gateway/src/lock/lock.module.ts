import { Module } from '@nestjs/common';
import { ReviewerModule } from '../reviewer/reviewer.module.js';
import { LockEngineService } from './lock-engine.service.js';

@Module({
  imports: [ReviewerModule],
  providers: [LockEngineService],
  exports: [LockEngineService],
})
export class LockModule {}
