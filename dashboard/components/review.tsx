'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { sideBySide, stableStringify, type LineKind } from '@/lib/diff';
import { errorMessage, usePoll } from '@/lib/use-poll';
import type { ToolDetail } from '@/lib/types';
import { ErrorBanner, StatusBadge, VerdictBadge, shortHash, timeAgo } from './badges';

const LINE_STYLES: Record<LineKind, string> = {
  same: '',
  removed: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200',
  added: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  empty: 'bg-zinc-100 dark:bg-zinc-800/50',
};

const ACTOR_KEY = 'toollock.actor';

export function Review() {
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const { data: tool, error, refresh } = usePoll<ToolDetail>(`tools/${encodeURIComponent(key)}/diff`);
  // The name input only renders after data loads, so reading localStorage here can't cause a hydration mismatch.
  const [actor, setActor] = useState(() => {
    try {
      return typeof window === 'undefined' ? '' : (localStorage.getItem(ACTOR_KEY) ?? '');
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    if (!tool) return;
    setBusy(true);
    setActionError(null);
    try {
      localStorage.setItem(ACTOR_KEY, actor);
    } catch {}
    try {
      const res = await fetch(`/api/admin/tools/${encodeURIComponent(key)}/${decision}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // expectedHash: refuse if the definition changed after this page loaded it.
        body: JSON.stringify({ actor: actor.trim(), expectedHash: tool.currentHash }),
      });
      if (!res.ok) setActionError(await errorMessage(res));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!tool) {
    return (
      <div>
        <ErrorBanner message={error} />
        <p className="text-sm text-zinc-500">Loading {key}…</p>
      </div>
    );
  }

  const rows = sideBySide(stableStringify(tool.approvedDefinition), stableStringify(tool.currentDefinition));
  const unchanged = tool.approvedHash === tool.currentHash;
  const review = tool.review;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Tools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{tool.key}</h1>
          <StatusBadge status={tool.status} />
          <span className="text-sm text-zinc-500">changed {timeAgo(tool.updatedAt)}</span>
        </div>
      </div>

      <ErrorBanner message={error ?? actionError} />

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Reviewer</h2>
          <VerdictBadge verdict={review?.verdict} />
          {review?.risk !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className={`h-full ${review.risk >= 70 ? 'bg-red-500' : review.risk >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${review.risk}%` }}
                />
              </div>
              <span className="text-zinc-500">risk {review.risk}/100</span>
            </div>
          )}
          {review?.approvedBy && <span className="text-sm text-zinc-500">auto-approved by {review.approvedBy}</span>}
        </div>
        {!review && tool.status === 'pending' && (
          <p className="mt-2 text-sm text-zinc-500">Waiting for the reviewer (it stays pending if the reviewer is unreachable).</p>
        )}
        {review?.reasons && review.reasons.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-medium uppercase text-zinc-500">Reasons</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {review.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {review?.signals && review.signals.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-medium uppercase text-zinc-500">Signals</h3>
            <ul className="mt-1 space-y-0.5 font-mono text-xs">
              {review.signals.map((s, i) => (
                <li key={i} className="text-red-700 dark:text-red-300">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-2 border-b border-zinc-200 text-xs font-medium uppercase text-zinc-500 dark:border-zinc-800">
          <div className="px-3 py-2">Approved · {shortHash(tool.approvedHash)}</div>
          <div className="border-l border-zinc-200 px-3 py-2 dark:border-zinc-800">
            Current (upstream) · {shortHash(tool.currentHash)}
          </div>
        </div>
        {tool.approvedDefinition === null && (
          <p className="px-3 py-2 text-sm text-zinc-500">New tool: nothing was approved before.</p>
        )}
        {unchanged && <p className="px-3 py-2 text-sm text-zinc-500">The current definition is the approved one.</p>}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed font-mono text-xs leading-5">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className={`w-1/2 whitespace-pre-wrap break-all px-3 align-top ${LINE_STYLES[row.left.kind]}`}>{row.left.text}</td>
                  <td className={`w-1/2 whitespace-pre-wrap break-all border-l border-zinc-200 px-3 align-top dark:border-zinc-800 ${LINE_STYLES[row.right.kind]}`}>
                    {row.right.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Your name (recorded in the audit log)</span>
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="e.g. alice"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <button
          onClick={() => decide('approve')}
          disabled={busy || !actor.trim() || (tool.status === 'approved' && unchanged)}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Approve current
        </button>
        <button
          onClick={() => decide('reject')}
          disabled={busy || !actor.trim() || tool.status === 'rejected'}
          className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          Reject
        </button>
      </section>
    </div>
  );
}
