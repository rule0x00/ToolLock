import { Controller, Delete, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { McpClientTokenGuard } from './mcp-client-token.guard.js';
import { ProxyService } from './proxy.service.js';

const jsonRpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

/**
 * Streamable HTTP endpoint in stateless mode: every POST gets a fresh server and
 * transport. Nest's Express adapter has already parsed the JSON body, so it is
 * handed to the transport as `parsedBody`.
 */
@Controller('mcp')
@UseGuards(McpClientTokenGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly proxy: ProxyService) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const server = this.proxy.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      this.logger.error(`MCP request failed: ${(err as Error).message}`);
      if (!res.headersSent) res.status(500).json(jsonRpcError(-32603, 'Internal server error'));
    }
  }

  // Stateless mode has no standalone SSE stream or session to delete.
  @Get()
  get(@Res() res: Response): void {
    res.status(405).json(jsonRpcError(-32000, 'Method not allowed.'));
  }

  @Delete()
  delete(@Res() res: Response): void {
    res.status(405).json(jsonRpcError(-32000, 'Method not allowed.'));
  }
}
