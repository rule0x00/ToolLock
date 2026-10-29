import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../db/database.module.js';
import { canonicalJson, sha256Hex } from '../lock/canonical.js';

export const GENESIS_HASH = '0'.repeat(64);
// Arbitrary constant; held per transaction so appends can't share a prev_hash.
const AUDIT_LOCK_ID = 7_160_002;

export type AuditAction = 'LOCK_INIT' | 'TOOL_CHANGED' | 'REVIEWED' | 'APPROVED' | 'REJECTED' | 'CALL_BLOCKED';

export interface AuditEventInput {
  actor: string;
  action: AuditAction;
  toolKey?: string | null;
  payload: Record<string, unknown>;
}

export interface AuditEvent {
  id: number;
  ts: string;
  actor: string;
  action: AuditAction;
  toolKey: string | null;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type VerifyResult = { ok: true; count: number } | { ok: false; brokenAtId: number };

/** hash = sha256(prev_hash + canonical(rest)), where rest is every field except id and the hashes. */
export function computeEventHash(
  prevHash: string,
  e: { ts: string; actor: string; action: string; toolKey: string | null; payload: unknown },
): string {
  return sha256Hex(prevHash + canonicalJson({ ts: e.ts, actor: e.actor, action: e.action, tool_key: e.toolKey, payload: e.payload }));
}

interface AuditRow {
  id: string;
  ts: Date;
  actor: string;
  action: AuditAction;
  tool_key: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

const toEvent = (r: AuditRow): AuditEvent => ({
  id: Number(r.id),
  ts: r.ts.toISOString(),
  actor: r.actor,
  action: r.action,
  toolKey: r.tool_key,
  payload: r.payload,
  prevHash: r.prev_hash,
  hash: r.hash,
});

/** Tamper-evident, append-only log of lock decisions and blocked calls. */
@Injectable()
export class AuditService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /**
   * Appends an event. Pass `client` to join an open transaction, so the event commits
   * (or rolls back) together with the change it records.
   */
  async append(input: AuditEventInput, client?: pg.PoolClient): Promise<AuditEvent> {
    if (client) return this.appendWith(client, input);
    const own = await this.pool.connect();
    try {
      await own.query('BEGIN');
      const event = await this.appendWith(own, input);
      await own.query('COMMIT');
      return event;
    } catch (err) {
      await own.query('ROLLBACK');
      throw err;
    } finally {
      own.release();
    }
  }

  async list(limit = 100): Promise<AuditEvent[]> {
    const { rows } = await this.pool.query<AuditRow>('SELECT * FROM audit_events ORDER BY id DESC LIMIT $1', [limit]);
    return rows.map(toEvent);
  }

  /** Walks the chain from the start; reports the first event whose link or hash doesn't check out. */
  async verify(): Promise<VerifyResult> {
    const { rows } = await this.pool.query<AuditRow>('SELECT * FROM audit_events ORDER BY id');
    let prevHash = GENESIS_HASH;
    for (const row of rows) {
      const e = toEvent(row);
      if (e.prevHash !== prevHash || computeEventHash(prevHash, e) !== e.hash) return { ok: false, brokenAtId: e.id };
      prevHash = e.hash;
    }
    return { ok: true, count: rows.length };
  }

  private async appendWith(client: pg.PoolClient, input: AuditEventInput): Promise<AuditEvent> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_ID]);
    const last = await client.query<{ hash: string }>('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1');
    const prevHash = last.rows[0]?.hash ?? GENESIS_HASH;
    // Millisecond ISO timestamps survive the timestamptz round trip exactly, so verify() can recompute them.
    const ts = new Date().toISOString();
    const toolKey = input.toolKey ?? null;
    const hash = computeEventHash(prevHash, { ts, actor: input.actor, action: input.action, toolKey, payload: input.payload });
    const { rows } = await client.query<AuditRow>(
      `INSERT INTO audit_events (ts, actor, action, tool_key, payload, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ts, input.actor, input.action, toolKey, JSON.stringify(input.payload), prevHash, hash],
    );
    return toEvent(rows[0]);
  }
}
