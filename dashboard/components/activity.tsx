'use client';

import { useState } from 'react';
import { errorMessage, usePoll } from '@/lib/use-poll';
import type { AuditEvent, CallRecord, VerifyResult } from '@/lib/types';
import { ErrorBanner, OutcomeBadge, shortHash, timeAgo } from './badges';

export function Activity() {
  const calls = usePoll<CallRecord[]>('calls?limit=50');
  const audit = usePoll<AuditEvent[]>('audit?limit=50');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function verifyChain() {
    setVerifyError(null);
    const res = await fetch('/api/admin/audit/verify', { cache: 'no-store' });
    if (!res.ok) return setVerifyError(await errorMessage(res));
    setVerify((await res.json()) as VerifyResult);
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">Recent tool calls</h1>
        <ErrorBanner message={calls.error} />
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Args (redacted)</th>
                <th className="px-3 py-2">Latency</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {calls.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                    No calls yet.
                  </td>
                </tr>
              )}
              {calls.data?.map((c) => (
                <tr key={c.id} className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${c.outcome === 'blocked' ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{timeAgo(c.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.toolKey}</td>
                  <td className="px-3 py-2">
                    <OutcomeBadge outcome={c.outcome} />
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-zinc-500" title={JSON.stringify(c.args)}>
                    {c.args === null ? '—' : JSON.stringify(c.args)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{c.latencyMs === null ? '—' : `${c.latencyMs} ms`}</td>
                  <td className="max-w-sm truncate px-3 py-2 text-xs text-zinc-500" title={c.error ?? ''}>
                    {c.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Audit log</h2>
          <button
            onClick={verifyChain}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            Verify chain
          </button>
          {verify?.ok === true && (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">✓ Chain intact ({verify.count} events)</span>
          )}
          {verify?.ok === false && (
            <span className="text-sm font-medium text-red-700 dark:text-red-400">✗ Chain broken at event #{verify.brokenAtId}</span>
          )}
        </div>
        <ErrorBanner message={audit.error ?? verifyError} />
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Hash</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${
                    verify?.ok === false && verify.brokenAtId === e.id ? 'bg-red-100 dark:bg-red-950/50' : ''
                  }`}
                  title={JSON.stringify(e.payload, null, 2)}
                >
                  <td className="px-3 py-2 text-zinc-500">{e.id}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{timeAgo(e.ts)}</td>
                  <td className="px-3 py-2">{e.actor}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.toolKey ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{shortHash(e.hash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
