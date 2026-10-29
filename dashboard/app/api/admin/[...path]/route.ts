// Server-side proxy to the gateway admin API. The ADMIN_TOKEN never reaches the browser,
// and only the endpoints the dashboard needs are reachable through it.

const ALLOWED: Array<{ method: 'GET' | 'POST'; pattern: RegExp }> = [
  { method: 'GET', pattern: /^tools$/ },
  { method: 'GET', pattern: /^tools\/[^/]+\/diff$/ },
  { method: 'POST', pattern: /^tools\/[^/]+\/(approve|reject)$/ },
  { method: 'GET', pattern: /^calls$/ },
  { method: 'GET', pattern: /^audit$/ },
  { method: 'GET', pattern: /^audit\/verify$/ },
  { method: 'GET', pattern: /^lockfile$/ },
];

async function forward(request: Request, params: Promise<{ path: string[] }>, method: 'GET' | 'POST') {
  const segments = (await params).path;
  const path = segments.map(encodeURIComponent).join('/');
  if (!ALLOWED.some((r) => r.method === method && r.pattern.test(path))) {
    return Response.json({ message: 'Not found' }, { status: 404 });
  }

  const gateway = process.env.GATEWAY_ADMIN_URL ?? 'http://localhost:3000';
  const token = process.env.ADMIN_TOKEN;
  if (!token) return Response.json({ message: 'ADMIN_TOKEN is not set for the dashboard' }, { status: 500 });

  const url = new URL(`/api/${path}`, gateway);
  url.search = new URL(request.url).search;
  try {
    const upstream = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: method === 'POST' ? await request.text() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        ...(upstream.headers.get('content-disposition') && { 'content-disposition': upstream.headers.get('content-disposition')! }),
      },
    });
  } catch (err) {
    return Response.json({ message: `Gateway unreachable: ${(err as Error).message}` }, { status: 502 });
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, ctx.params, 'GET');
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, ctx.params, 'POST');
}
