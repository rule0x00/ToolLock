import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { UpstreamService } from '../upstream/upstream.service.js';
import { parseToolKey, toolKey } from './tool-key.js';

/**
 * Builds the downstream MCP server that clients talk to. Upstream tools are exposed
 * as `${serverId}__${toolName}`. Lock checks and call logging arrive in build step 5.
 */
@Injectable()
export class ProxyService {
  constructor(private readonly upstream: UpstreamService) {}

  createServer(): McpServer {
    const mcp = new McpServer({ name: 'toollock', version: '0.1.0' }, { capabilities: { tools: {} } });
    // Raw handlers rather than registerTool(): upstream schemas are JSON Schema, not zod.
    mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await this.listTools() }));
    mcp.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      this.callTool(req.params.name, req.params.arguments),
    );
    return mcp;
  }

  async listTools() {
    // Re-fetched on every downstream tools/list (simple and correct for an MVP).
    const tools = await this.upstream.listAllTools();
    return tools.map(({ serverId, tool }) => ({ ...tool, name: toolKey(serverId, tool.name) }));
  }

  async callTool(key: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    const parsed = parseToolKey(key);
    if (!parsed || !this.upstream.serverIds().includes(parsed.serverId)) {
      return { isError: true, content: [{ type: 'text', text: `ToolLock: unknown tool '${key}'.` }] };
    }
    return this.upstream.callTool(parsed.serverId, parsed.toolName, args);
  }
}
