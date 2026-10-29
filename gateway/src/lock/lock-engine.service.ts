import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type pg from 'pg';
import { AuditService } from '../audit/audit.service.js';
import { TOOLLOCK_CONFIG } from '../config/config.module.js';
import type { ToolLockConfig } from '../config/toollock-config.js';
import { PG_POOL } from '../db/database.module.js';
import { toolKey } from '../proxy/tool-key.js';
import { ReviewerClientService } from '../reviewer/reviewer-client.service.js';
import type { UpstreamTool } from '../upstream/upstream.service.js';
import { canonicalJson, sha256Hex, toolDefinition, type ToolDefinition } from './canonical.js';
import { classifyTool, type ToolStatus } from './lock-state.js';
import { buildLockfile, type Lockfile } from './lockfile.js';

export interface ToolState {
  key: string;
  status: ToolStatus;
  approvedHash: string | null;
  currentHash: string;
  /** Approved, and the definition upstream right now is the approved one. */
  callable: boolean;
}

export interface ToolSummary {
  key: string;
  serverId: string;
  toolName: string;
  status: ToolStatus;
  approvedHash: string | null;
  currentHash: string;
  verdict: string | null;
  risk: number | null;
  updatedAt: string;
}

export interface ToolDetail extends ToolSummary {
  approvedDefinition: ToolDefinition | null;
  currentDefinition: ToolDefinition;
  review: Record<string, unknown> | null;
}

interface Observed {
  key: string;
  serverId: string;
  toolName: string;
  def: ToolDefinition;
  hash: string;
}

interface ReviewJob extends Observed {
  oldDef: ToolDefinition | null;
}

interface ToolRow {
  tool_key: string;
  server_id: string;
  tool_name: string;
  status: ToolStatus;
  approved_hash: string | null;
  approved_def: ToolDefinition | null;
  current_hash: string;
  current_def: ToolDefinition;
  review: Record<string, unknown> | null;
  updated_at: Date;
}

const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const toSummary = (r: ToolRow): ToolSummary => ({
  key: r.tool_key,
  serverId: r.server_id,
  toolName: r.tool_name,
  status: r.status,
  approvedHash: r.approved_hash,
  currentHash: r.current_hash,
  verdict: typeof r.review?.verdict === 'string' ? r.review.verdict : null,
  risk: typeof r.review?.risk === 'number' ? r.review.risk : null,
  updatedAt: r.updated_at.toISOString(),
});

/** Pins tool definitions by hash and decides what is callable (see the status table in CLAUDE.md). */
@Injectable()
export class LockEngineService {
  private readonly logger = new Logger(LockEngineService.name);
  /** Reviews in progress, keyed by `${toolKey}@${hash}` so each definition is reviewed once at a time. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(ReviewerClientService) private readonly reviewer: Pick<ReviewerClientService, 'review'>,
    @Inject(TOOLLOCK_CONFIG) private readonly config: Pick<ToolLockConfig, 'policy'>,
    private readonly audit: AuditService,
  ) {}

  /** `toollock init`: approves every given tool as-is and returns the lockfile for them. */
  async initLock(tools: UpstreamTool[], actor = 'cli'): Promise<Lockfile> {
    const observed = this.observe(tools);
    await this.transaction(async (client) => {
      for (const t of observed) {
        await client.query(
          `INSERT INTO tools (tool_key, server_id, tool_name, status, approved_hash, approved_def, current_hash, current_def)
           VALUES ($1, $2, $3, 'approved', $4, $5, $4, $5)
           ON CONFLICT (tool_key) DO UPDATE SET
             server_id = EXCLUDED.server_id, tool_name = EXCLUDED.tool_name, status = 'approved',
             approved_hash = EXCLUDED.approved_hash, approved_def = EXCLUDED.approved_def,
             current_hash = EXCLUDED.current_hash, current_def = EXCLUDED.current_def,
             review = NULL, updated_at = now()`,
          [t.key, t.serverId, t.toolName, t.hash, JSON.stringify(t.def)],
        );
      }
      await this.audit.append(
        { actor, action: 'LOCK_INIT', payload: { tools: Object.fromEntries(observed.map((t) => [t.key, t.hash])) } },
        client,
      );
    });
    return buildLockfile(
      observed.map((t) => ({ toolKey: t.key, serverId: t.serverId, toolName: t.toolName, hash: t.hash, definition: t.def })),
    );
  }

  /**
   * Records the current upstream definitions and returns each tool's state. Pending
   * tools without a review are sent to the reviewer in the background (also retrying
   * after a reviewer outage), so callers never wait on the reviewer.
   */
  async sync(tools: UpstreamTool[]): Promise<Map<string, ToolState>> {
    const states = new Map<string, ToolState>();
    const toReview: ReviewJob[] = [];

    await this.transaction(async (client) => {
      // Sorted so concurrent syncs lock rows in the same order and can't deadlock.
      for (const t of this.observe(tools)) {
        const inserted = await client.query(
          `INSERT INTO tools (tool_key, server_id, tool_name, status, current_hash, current_def)
           VALUES ($1, $2, $3, 'pending', $4, $5)
           ON CONFLICT (tool_key) DO NOTHING`,
          [t.key, t.serverId, t.toolName, t.hash, JSON.stringify(t.def)],
        );

        let status: ToolStatus = 'pending';
        let approvedHash: string | null = null;
        let approvedDef: ToolDefinition | null = null;
        let review: unknown = null;

        if (inserted.rowCount) {
          await this.toolChanged(client, t, { transition: 'new' });
        } else {
          const { rows } = await client.query<ToolRow>('SELECT * FROM tools WHERE tool_key = $1 FOR UPDATE', [t.key]);
          const row = rows[0];
          ({ status, approved_hash: approvedHash, approved_def: approvedDef, review } = row);
          const transition = classifyTool({ status, approvedHash, currentHash: row.current_hash }, t.hash);
          if (transition === 'reverted' || transition === 'changed') {
            status = transition === 'reverted' ? 'approved' : 'pending';
            review = null;
            await client.query(
              `UPDATE tools SET status = $2, current_hash = $3, current_def = $4, review = NULL, updated_at = now()
               WHERE tool_key = $1`,
              [t.key, status, t.hash, JSON.stringify(t.def)],
            );
            await this.toolChanged(client, t, { transition, approvedHash, previousHash: row.current_hash });
          }
        }

        states.set(t.key, {
          key: t.key,
          status,
          approvedHash,
          currentHash: t.hash,
          callable: status === 'approved' && approvedHash === t.hash,
        });
        if (status === 'pending' && review === null) toReview.push({ ...t, oldDef: approvedDef });
      }
    });

    for (const job of toReview) this.scheduleReview(job);
    return states;
  }

  /**
   * A human approves the tool's current definition. With `expectedHash`, refuses if the
   * definition changed since the approver looked at it.
   */
  async approve(key: string, actor: string, expectedHash?: string): Promise<ToolSummary> {
    return this.decide(key, actor, 'approved', expectedHash);
  }

  /** A human rejects the tool; it stays blocked, and its last approved version stays recorded. */
  async reject(key: string, actor: string, expectedHash?: string): Promise<ToolSummary> {
    return this.decide(key, actor, 'rejected', expectedHash);
  }

  async listTools(): Promise<ToolSummary[]> {
    const { rows } = await this.pool.query<ToolRow>('SELECT * FROM tools ORDER BY server_id, tool_name');
    return rows.map(toSummary);
  }

  async getTool(key: string): Promise<ToolDetail> {
    const { rows } = await this.pool.query<ToolRow>('SELECT * FROM tools WHERE tool_key = $1', [key]);
    if (!rows[0]) throw new NotFoundException(`Tool '${key}' not found`);
    const r = rows[0];
    return { ...toSummary(r), approvedDefinition: r.approved_def, currentDefinition: r.current_def, review: r.review };
  }

  /** The pinned (approved) version of every tool that has one, as mcp.lock.json. */
  async exportLockfile(): Promise<Lockfile> {
    const { rows } = await this.pool.query<ToolRow>('SELECT * FROM tools WHERE approved_hash IS NOT NULL');
    return buildLockfile(
      rows.map((r) => ({
        toolKey: r.tool_key,
        serverId: r.server_id,
        toolName: r.tool_name,
        hash: r.approved_hash!,
        definition: r.approved_def ?? {},
      })),
    );
  }

  /** Resolves once no reviews are in flight (used by tests and the CLI). */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight.values()]);
  }

  private async decide(key: string, actor: string, status: 'approved' | 'rejected', expectedHash?: string) {
    let updated!: ToolRow;
    await this.transaction(async (client) => {
      const { rows } = await client.query<ToolRow>('SELECT * FROM tools WHERE tool_key = $1 FOR UPDATE', [key]);
      const row = rows[0];
      if (!row) throw new NotFoundException(`Tool '${key}' not found`);
      if (expectedHash && expectedHash !== row.current_hash) {
        throw new ConflictException(`Tool '${key}' changed since it was reviewed; reload and review again`);
      }
      const result = await client.query<ToolRow>(
        status === 'approved'
          ? `UPDATE tools SET status = 'approved', approved_hash = current_hash, approved_def = current_def, updated_at = now()
             WHERE tool_key = $1 RETURNING *`
          : `UPDATE tools SET status = 'rejected', updated_at = now() WHERE tool_key = $1 RETURNING *`,
        [key],
      );
      updated = result.rows[0];
      await this.audit.append(
        {
          actor,
          action: status === 'approved' ? 'APPROVED' : 'REJECTED',
          toolKey: key,
          payload: { hash: row.current_hash, previousStatus: row.status },
        },
        client,
      );
    });
    return toSummary(updated);
  }

  private async toolChanged(client: pg.PoolClient, t: Observed, details: Record<string, unknown>): Promise<void> {
    await this.audit.append(
      {
        actor: 'gateway',
        action: 'TOOL_CHANGED',
        toolKey: t.key,
        payload: { serverId: t.serverId, toolName: t.toolName, newHash: t.hash, ...details },
      },
      client,
    );
  }

  private scheduleReview(job: ReviewJob): void {
    const id = `${job.key}@${job.hash}`;
    if (this.inFlight.has(id)) return;
    const run = this.runReview(job)
      .catch((err) => this.logger.error(`Review of ${job.key} failed: ${(err as Error).message}`))
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, run);
  }

  private async runReview(job: ReviewJob): Promise<void> {
    const reviewedAt = new Date().toISOString();
    let result;
    try {
      result = await this.reviewer.review({
        serverId: job.serverId,
        toolName: job.toolName,
        oldDefinition: job.oldDef,
        newDefinition: job.def,
      });
    } catch (err) {
      const message = (err as Error).message;
      if (this.config.policy.failClosed) {
        this.logger.warn(`Reviewer unavailable for ${job.key}; staying pending (fail closed): ${message}`);
        return;
      }
      this.logger.warn(`Reviewer unavailable for ${job.key}; approving (fail open): ${message}`);
      await this.applyReview(job, { error: message, approvedBy: 'fail-open', reviewedAt }, 'fail-open');
      return;
    }

    const autoApprove = result.verdict === 'SAFE_COSMETIC' && this.config.policy.autoApproveCosmetic;
    await this.applyReview(
      job,
      { ...result, reviewedAt, ...(autoApprove && { approvedBy: 'reviewer-agent' }) },
      autoApprove ? 'reviewer-agent' : undefined,
    );
  }

  /**
   * Stores a review (and approves if `approvedBy` is set), unless the tool has changed
   * or been decided since the review started.
   */
  private async applyReview(job: ReviewJob, review: Record<string, unknown>, approvedBy?: string): Promise<void> {
    await this.transaction(async (client) => {
      const approve = approvedBy !== undefined;
      const result = await client.query(
        `UPDATE tools SET
           review = $3,
           status = CASE WHEN $4 THEN 'approved' ELSE status END,
           approved_hash = CASE WHEN $4 THEN current_hash ELSE approved_hash END,
           approved_def = CASE WHEN $4 THEN current_def ELSE approved_def END,
           updated_at = now()
         WHERE tool_key = $1 AND current_hash = $2 AND status = 'pending'`,
        [job.key, job.hash, JSON.stringify(review), approve],
      );
      if (!result.rowCount) return;
      await this.audit.append(
        { actor: 'reviewer-agent', action: 'REVIEWED', toolKey: job.key, payload: { hash: job.hash, ...review } },
        client,
      );
      if (approve) {
        await this.audit.append({ actor: approvedBy, action: 'APPROVED', toolKey: job.key, payload: { hash: job.hash } }, client);
      }
    });
  }

  private observe(tools: UpstreamTool[]): Observed[] {
    return tools
      .map(({ serverId, tool }) => {
        const def = toolDefinition(tool);
        return { key: toolKey(serverId, tool.name), serverId, toolName: tool.name, def, hash: sha256Hex(canonicalJson(def)) };
      })
      .sort(byKey);
  }

  private async transaction(fn: (client: pg.PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await fn(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
