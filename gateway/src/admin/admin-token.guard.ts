import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { bearerMatches } from '../common/bearer.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** MVP auth for /api/*: one shared ADMIN_TOKEN bearer token (see README Limitations). */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Pick<Env, 'ADMIN_TOKEN'>) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.env.ADMIN_TOKEN) throw new UnauthorizedException('ADMIN_TOKEN is not configured');
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    if (!bearerMatches(header, this.env.ADMIN_TOKEN)) throw new UnauthorizedException('Missing or invalid bearer token');
    return true;
  }
}
