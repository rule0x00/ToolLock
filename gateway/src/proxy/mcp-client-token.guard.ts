import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** MVP auth for /mcp: a static bearer token (MCP OAuth is out of scope; see README Limitations). */
@Injectable()
export class McpClientTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.env.MCP_CLIENT_TOKEN;
    if (!token) throw new UnauthorizedException('MCP_CLIENT_TOKEN is not configured');
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const presented = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    const expected = Buffer.from(token);
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }
    return true;
  }
}
