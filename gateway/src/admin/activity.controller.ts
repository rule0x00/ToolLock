import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { LockEngineService } from '../lock/lock-engine.service.js';
import { CallLogService } from '../proxy/call-log.service.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { limitQuerySchema } from './schemas.js';

type LimitQuery = z.infer<typeof limitQuerySchema>;

@Controller('api')
@UseGuards(AdminTokenGuard)
export class ActivityController {
  constructor(
    private readonly calls: CallLogService,
    private readonly audit: AuditService,
    private readonly lock: LockEngineService,
  ) {}

  @Get('calls')
  listCalls(@Query(new ZodPipe(limitQuerySchema)) query: LimitQuery) {
    return this.calls.list(query.limit);
  }

  @Get('audit')
  listAudit(@Query(new ZodPipe(limitQuerySchema)) query: LimitQuery) {
    return this.audit.list(query.limit);
  }

  @Get('audit/verify')
  verifyAudit() {
    return this.audit.verify();
  }

  @Get('lockfile')
  @Header('content-disposition', 'attachment; filename="mcp.lock.json"')
  lockfile() {
    return this.lock.exportLockfile();
  }
}
