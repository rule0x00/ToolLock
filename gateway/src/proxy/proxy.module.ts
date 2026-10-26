import { Module } from '@nestjs/common';
import { UpstreamModule } from '../upstream/upstream.module.js';
import { McpClientTokenGuard } from './mcp-client-token.guard.js';
import { McpController } from './mcp.controller.js';
import { ProxyService } from './proxy.service.js';

@Module({
  imports: [UpstreamModule],
  controllers: [McpController],
  providers: [ProxyService, McpClientTokenGuard],
})
export class ProxyModule {}
