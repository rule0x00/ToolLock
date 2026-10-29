import { Inject, Injectable, Logger } from '@nestjs/common';
import type pg from 'pg';
import { AuditService } from '../audit/audit.service.js';
import { PG_POOL } from '../db/database.module.js';
import { redactArgs } from './redact.js';

export interface CallLogRecord {
  id: number;
  toolKey: string;
  toolHash: string | null;
  args: unknown;
  outcome: CallLogEntry['outcome'];
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface CallLogEntry {
  toolKey: string;
  toolHash: string | null;
  args: Record<string, unknown> | undefined;
  outcome: 'allowed' | 'blocked' | 'error';
  latencyMs?: number;
  error?: string;
}

/** Writes every downstream tools/call (allowed, blocked or failed) to `tool_calls`; blocked calls are also audited. */
@Injectable()
export class CallLogService {
  private readonly logger = new Logger(CallLogService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly audit: AuditService,
  ) {}

  async record(entry: CallLogEntry): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO tool_calls (tool_key, tool_hash, args, outcome, latency_ms, error) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          entry.toolKey,
          entry.toolHash,
          entry.args === undefined ? null : JSON.stringify(redactArgs(entry.args)),
          entry.outcome,
          entry.latencyMs ?? null,
          entry.error ?? null,
        ],
      );
      if (entry.outcome === 'blocked') {
        await this.audit.append(
          { actor: 'gateway', action: 'CALL_BLOCKED', toolKey: entry.toolKey, payload: { hash: entry.toolHash, reason: entry.error } },
          client,
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // A logging failure must not change the outcome the caller already got.
      this.logger.error(`Failed to log call to ${entry.toolKey}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  async list(limit = 100): Promise<CallLogRecord[]> {
    const { rows } = await this.pool.query(
      'SELECT id, tool_key, tool_hash, args, outcome, latency_ms, error, created_at FROM tool_calls ORDER BY id DESC LIMIT $1',
      [limit],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      toolKey: r.tool_key,
      toolHash: r.tool_hash,
      args: r.args,
      outcome: r.outcome,
      latencyMs: r.latency_ms,
      error: r.error,
      createdAt: r.created_at.toISOString(),
    }));
  }
}
