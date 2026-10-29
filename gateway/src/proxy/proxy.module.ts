import { Module } from '@nestjs/common';
import { LockModule } from '../lock/lock.module.js';
import { UpstreamModule } from '../upstream/upstream.module.js';
import { CallLogService } from './call-log.service.js';
import { McpClientTokenGuard } from './mcp-client-token.guard.js';
import { McpController } from './mcp.controller.js';
import { ProxyService } from './proxy.service.js';

@Module({
  imports: [UpstreamModule, LockModule],
  controllers: [McpController],
  providers: [ProxyService, CallLogService, McpClientTokenGuard],
})
export class ProxyModule {}
