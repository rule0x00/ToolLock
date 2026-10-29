import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { LockEngineService } from '../lock/lock-engine.service.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { decisionBodySchema } from './schemas.js';

type DecisionBody = z.infer<typeof decisionBodySchema>;

@Controller('api/tools')
@UseGuards(AdminTokenGuard)
export class ToolsController {
  constructor(private readonly lock: LockEngineService) {}

  @Get()
  list() {
    return this.lock.listTools();
  }

  @Get(':key/diff')
  diff(@Param('key') key: string) {
    return this.lock.getTool(key);
  }

  @Post(':key/approve')
  @HttpCode(200)
  approve(@Param('key') key: string, @Body(new ZodPipe(decisionBodySchema)) body: DecisionBody) {
    return this.lock.approve(key, body.actor, body.expectedHash);
  }

  @Post(':key/reject')
  @HttpCode(200)
  reject(@Param('key') key: string, @Body(new ZodPipe(decisionBodySchema)) body: DecisionBody) {
    return this.lock.reject(key, body.actor, body.expectedHash);
  }
}
