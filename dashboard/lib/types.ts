export type ToolStatus = 'approved' | 'pending' | 'rejected';
export type Verdict = 'SAFE_COSMETIC' | 'NEW_CAPABILITY' | 'SUSPICIOUS';

export interface ToolSummary {
  key: string;
  serverId: string;
  toolName: string;
  status: ToolStatus;
  approvedHash: string | null;
  currentHash: string;
  verdict: Verdict | null;
  risk: number | null;
  updatedAt: string;
}

export interface ToolDetail extends ToolSummary {
  approvedDefinition: Record<string, unknown> | null;
  currentDefinition: Record<string, unknown>;
  review: {
    verdict?: Verdict;
    risk?: number;
    reasons?: string[];
    signals?: string[];
    reviewedAt?: string;
    approvedBy?: string;
    error?: string;
  } | null;
}

export interface CallRecord {
  id: number;
  toolKey: string;
  toolHash: string | null;
  args: unknown;
  outcome: 'allowed' | 'blocked' | 'error';
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: number;
  ts: string;
  actor: string;
  action: string;
  toolKey: string | null;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type VerifyResult = { ok: true; count: number } | { ok: false; brokenAtId: number };
