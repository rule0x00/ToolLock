import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { LockEngineService } from '../lock/lock-engine.service.js';
import { UpstreamService } from '../upstream/upstream.service.js';
import { CallLogService } from './call-log.service.js';
import { parseToolKey, toolKey } from './tool-key.js';

const toolError = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });

/**
 * Builds the downstream MCP server that clients talk to. Upstream tools are exposed
 * as `${serverId}__${toolName}`, and only while the lock engine says they're callable.
 */
@Injectable()
export class ProxyService implements OnModuleInit {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly upstream: UpstreamService,
    private readonly lock: LockEngineService,
    private readonly callLog: CallLogService,
  ) {}

  onModuleInit(): void {
    this.upstream.onToolsChanged((serverId) => void this.recheck(serverId));
  }

  createServer(): McpServer {
    const mcp = new McpServer({ name: 'toollock', version: '0.1.0' }, { capabilities: { tools: {} } });
    // Raw handlers rather than registerTool(): upstream schemas are JSON Schema, not zod.
    mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await this.listTools() }));
    mcp.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      this.callTool(req.params.name, req.params.arguments),
    );
    return mcp;
  }

  /** Re-fetched on every downstream tools/list (simple and correct for an MVP). */
  async listTools() {
    const tools = await this.upstream.listAllTools();
    const states = await this.lock.sync(tools);
    return tools
      .filter(({ serverId, tool }) => states.get(toolKey(serverId, tool.name))?.callable)
      .map(({ serverId, tool }) => ({ ...tool, name: toolKey(serverId, tool.name) }));
  }

  async callTool(key: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    const parsed = parseToolKey(key);
    if (!parsed || !this.upstream.serverIds().includes(parsed.serverId)) {
      return this.block(key, null, args, `ToolLock: unknown tool '${key}'.`);
    }

    // Re-check the live definition right before forwarding, so a change between
    // tools/list and tools/call is still caught.
    let tools;
    try {
      tools = await this.upstream.listServerTools(parsed.serverId);
    } catch (err) {
      return this.block(key, null, args, `ToolLock: could not verify tool '${key}' with its upstream; blocked.`);
    }
    if (!tools.some((t) => t.tool.name === parsed.toolName)) {
      return this.block(key, null, args, `ToolLock: unknown tool '${key}'.`);
    }
    const state = (await this.lock.sync(tools)).get(key)!;
    if (!state.callable) {
      const reason =
        state.status === 'rejected'
          ? `ToolLock: tool '${key}' was rejected and is blocked.`
          : `ToolLock: tool '${key}' changed since approval and is blocked pending review.`;
      return this.block(key, state.currentHash, args, reason);
    }

    const started = Date.now();
    try {
      const result = await this.upstream.callTool(parsed.serverId, parsed.toolName, args);
      await this.callLog.record({ toolKey: key, toolHash: state.currentHash, args, outcome: 'allowed', latencyMs: Date.now() - started });
      return result;
    } catch (err) {
      const message = (err as Error).message;
      await this.callLog.record({
        toolKey: key,
        toolHash: state.currentHash,
        args,
        outcome: 'error',
        latencyMs: Date.now() - started,
        error: message,
      });
      return toolError(`ToolLock: upstream error calling '${key}': ${message}`);
    }
  }

  private async block(key: string, hash: string | null, args: Record<string, unknown> | undefined, reason: string) {
    await this.callLog.record({ toolKey: key, toolHash: hash, args, outcome: 'blocked', error: reason });
    return toolError(reason);
  }

  /** Upstream sent notifications/tools/list_changed: record the new definitions now. */
  private async recheck(serverId: string): Promise<void> {
    try {
      await this.lock.sync(await this.upstream.listServerTools(serverId));
    } catch (err) {
      this.logger.error(`Re-check after list_changed failed for "${serverId}": ${(err as Error).message}`);
    }
  }
}
