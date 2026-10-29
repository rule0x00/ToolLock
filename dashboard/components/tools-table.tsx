'use client';

import Link from 'next/link';
import { usePoll } from '@/lib/use-poll';
import type { ToolSummary } from '@/lib/types';
import { ErrorBanner, StatusBadge, VerdictBadge, shortHash, timeAgo } from './badges';

export function ToolsTable() {
  const { data: tools, error } = usePoll<ToolSummary[]>('tools');
  const pending = tools?.filter((t) => t.status === 'pending').length ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Tools</h1>
        <p className="text-sm text-zinc-500">
          {tools ? `${tools.length} tools · ${pending} pending review` : 'Loading…'} ·{' '}
          {/* A file download from an API route (not page navigation), so a plain <a download>. */}
          <a href="/api/admin/lockfile" download="mcp.lock.json" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            download mcp.lock.json
          </a>
        </p>
      </div>
      <ErrorBanner message={error} />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-3 py-2">Server</th>
              <th className="px-3 py-2">Tool</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reviewer</th>
              <th className="px-3 py-2">Current hash</th>
              <th className="px-3 py-2">Last changed</th>
            </tr>
          </thead>
          <tbody>
            {tools?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No tools yet. Run <code>toollock init</code> or list tools through the gateway.
                </td>
              </tr>
            )}
            {tools?.map((t) => (
              <tr
                key={t.key}
                className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${
                  t.status === 'pending' ? 'bg-amber-50 dark:bg-amber-950/30' : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">{t.serverId}</td>
                <td className="px-3 py-2">
                  <Link href={`/tools/${encodeURIComponent(t.key)}`} className="font-medium underline-offset-2 hover:underline">
                    {t.toolName}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-3 py-2">
                  <VerdictBadge verdict={t.verdict} />
                  {t.risk !== null && <span className="ml-2 text-xs text-zinc-500">risk {t.risk}</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{shortHash(t.currentHash)}</td>
                <td className="px-3 py-2 text-zinc-500">{timeAgo(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
