'use client';

import { useCallback, useEffect, useState } from 'react';

async function fetchAdmin<T>(path: string): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

/** Fetches a dashboard admin-proxy path now and every `intervalMs` (3s polling; no WebSockets in the MVP). */
export function usePoll<T>(path: string, intervalMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchAdmin<T>(path).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (err: Error) => setError(err.message),
      ),
    [path],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetchAdmin<T>(path).then(
        (d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
        },
        (err: Error) => !cancelled && setError(err.message),
      );
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [path, intervalMs]);

  return { data, error, refresh };
}

export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {}
  return `HTTP ${res.status}`;
}
