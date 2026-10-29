import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ReviewerClientService, ReviewerUnavailableError } from '../src/reviewer/reviewer-client.service.js';

const request = {
  serverId: 'mailer',
  toolName: 'send_email',
  oldDefinition: null,
  newDefinition: { name: 'send_email', description: 'Send an email' },
};
const goodResult = { verdict: 'SUSPICIOUS', risk: 90, reasons: ['bcc'], signals: ['EXFIL_PARAM'] };

describe('ReviewerClientService', () => {
  let server: Server;
  let url: string;
  let respond: (body: string, res: import('node:http').ServerResponse) => void;
  let received: unknown;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received = { method: req.method, url: req.url, body: JSON.parse(body) };
        respond(body, res);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const client = (reviewerUrl: string | undefined = url) => new ReviewerClientService({ REVIEWER_URL: reviewerUrl });
  const reply = (status: number, body: unknown) => {
    respond = (_b, res) => res.writeHead(status, { 'content-type': 'application/json' }).end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  it('POSTs the request to /review and returns the validated result', async () => {
    reply(200, goodResult);
    expect(await client().review(request)).toEqual(goodResult);
    expect(received).toEqual({ method: 'POST', url: '/review', body: request });
  });

  it.each([
    ['an HTTP error', () => reply(500, { detail: 'boom' })],
    ['invalid JSON', () => reply(200, 'not json')],
    ['an unknown verdict', () => reply(200, { ...goodResult, verdict: 'PROBABLY_FINE' })],
    ['an out-of-range risk', () => reply(200, { ...goodResult, risk: 500 })],
    ['missing fields', () => reply(200, { verdict: 'SAFE_COSMETIC' })],
  ])('treats %s as unavailable', async (_label, setup) => {
    setup();
    await expect(client().review(request)).rejects.toBeInstanceOf(ReviewerUnavailableError);
  });

  it('times out slow reviewers', async () => {
    respond = (_b, res) => setTimeout(() => res.writeHead(200).end(JSON.stringify(goodResult)), 500);
    const c = client();
    c.timeoutMs = 50;
    await expect(c.review(request)).rejects.toThrow(/Reviewer request failed/);
  });

  it('is unavailable when the reviewer is unreachable or not configured', async () => {
    await expect(client('http://127.0.0.1:1').review(request)).rejects.toBeInstanceOf(ReviewerUnavailableError);
    await expect(new ReviewerClientService({ REVIEWER_URL: undefined }).review(request)).rejects.toThrow(/REVIEWER_URL is not set/);
  });
});
