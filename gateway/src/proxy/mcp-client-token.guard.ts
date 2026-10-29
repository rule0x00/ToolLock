import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { bearerMatches } from '../common/bearer.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** MVP auth for /mcp: a static bearer token (MCP OAuth is out of scope; see README Limitations). */
@Injectable()
export class McpClientTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.env.MCP_CLIENT_TOKEN) throw new UnauthorizedException('MCP_CLIENT_TOKEN is not configured');
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    if (!bearerMatches(header, this.env.MCP_CLIENT_TOKEN)) throw new UnauthorizedException('Missing or invalid bearer token');
    return true;
  }
}
