import type { ToolStatus, Verdict } from '@/lib/types';

const STATUS_STYLES: Record<ToolStatus, string> = {
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const VERDICT_STYLES: Record<Verdict, string> = {
  SAFE_COSMETIC: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  NEW_CAPABILITY: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  SUSPICIOUS: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function StatusBadge({ status }: { status: ToolStatus }) {
  return <span className={`${pill} ${STATUS_STYLES[status]}`}>{status}</span>;
}

export function VerdictBadge({ verdict }: { verdict: Verdict | null | undefined }) {
  if (!verdict) return <span className="text-xs text-zinc-400">—</span>;
  return <span className={`${pill} ${VERDICT_STYLES[verdict]}`}>{verdict.replace('_', ' ').toLowerCase()}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: 'allowed' | 'blocked' | 'error' }) {
  const styles = {
    allowed: STATUS_STYLES.approved,
    blocked: STATUS_STYLES.rejected,
    error: STATUS_STYLES.pending,
  };
  return <span className={`${pill} ${styles[outcome]}`}>{outcome}</span>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </div>
  );
}

export function shortHash(hash: string | null | undefined) {
  return hash ? `${hash.slice(0, 10)}…` : '—';
}

export function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
