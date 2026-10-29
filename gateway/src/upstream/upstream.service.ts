import path from 'node:path';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { TOOLLOCK_CONFIG } from '../config/config.module.js';
import type { ToolLockConfig, UpstreamServerConfig } from '../config/toollock-config.js';

export interface UpstreamTool {
  serverId: string;
  tool: Tool;
}

/** MCP client connections to every upstream server in toollock.config.json. */
@Injectable()
export class UpstreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UpstreamService.name);
  private readonly clients = new Map<string, Client>();
  private readonly toolsChangedListeners: Array<(serverId: string) => void> = [];

  constructor(@Inject(TOOLLOCK_CONFIG) private readonly config: ToolLockConfig) {}

  async onModuleInit(): Promise<void> {
    // A server that fails to connect contributes no tools; the others keep working.
    await Promise.all(
      this.config.servers.map(async (server) => {
        try {
          this.clients.set(server.id, await this.connect(server));
          this.logger.log(`Connected to upstream "${server.id}"`);
        } catch (err) {
          this.logger.error(`Upstream "${server.id}" failed to connect: ${(err as Error).message}`);
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.clients.values()].map((c) => c.close()));
    this.clients.clear();
  }

  serverIds(): string[] {
    return [...this.clients.keys()];
  }

  /** Called with the server id whenever an upstream sends notifications/tools/list_changed. */
  onToolsChanged(listener: (serverId: string) => void): void {
    this.toolsChangedListeners.push(listener);
  }

  /** Fetches the current tool list from every connected upstream. A failing server contributes no tools. */
  async listAllTools(): Promise<UpstreamTool[]> {
    const perServer = await Promise.all(
      this.serverIds().map(async (serverId) => {
        try {
          return await this.listServerTools(serverId);
        } catch (err) {
          this.logger.error(`tools/list failed for "${serverId}": ${(err as Error).message}`);
          return [];
        }
      }),
    );
    return perServer.flat();
  }

  /** Fetches the current tool list (all pages) from one upstream; throws if it can't. */
  async listServerTools(serverId: string): Promise<UpstreamTool[]> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`Upstream "${serverId}" is not connected`);
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools.map((tool) => ({ serverId, tool }));
  }

  async callTool(serverId: string, name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`Upstream "${serverId}" is not connected`);
    return (await client.callTool({ name, arguments: args })) as CallToolResult;
  }

  private async connect(server: UpstreamServerConfig): Promise<Client> {
    const client = new Client({ name: 'toollock-gateway', version: '0.1.0' });
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      this.logger.log(`Upstream "${server.id}" reported tools/list_changed`);
      for (const listener of this.toolsChangedListeners) listener(server.id);
    });

    const transport =
      'url' in server
        ? new StreamableHTTPClientTransport(new URL(server.url))
        : new StdioClientTransport({
            command: server.command,
            args: server.args,
            env: server.env ? { ...(process.env as Record<string, string>), ...server.env } : undefined,
            cwd: path.resolve(this.config.baseDir),
            stderr: 'inherit',
          });
    await client.connect(transport);
    return client;
  }
}
