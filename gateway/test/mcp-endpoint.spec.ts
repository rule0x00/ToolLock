import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AddressInfo } from 'node:net';
import { ENV } from '../src/config/config.module.js';
import { LockEngineService } from '../src/lock/lock-engine.service.js';
import { CallLogService } from '../src/proxy/call-log.service.js';
import { McpClientTokenGuard } from '../src/proxy/mcp-client-token.guard.js';
import { McpController } from '../src/proxy/mcp.controller.js';
import { ProxyService } from '../src/proxy/proxy.service.js';
import { UpstreamService } from '../src/upstream/upstream.service.js';

const TOKEN = 'test-token';

const fsTools = [
  { serverId: 'fs', tool: { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' as const } } },
];

const fakeUpstream = {
  serverIds: () => ['fs'],
  onToolsChanged: () => {},
  listAllTools: async () => fsTools,
  listServerTools: async () => fsTools,
  callTool: async (serverId: string, name: string, args: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify({ serverId, name, args }) }],
  }),
};

// Locking is covered in proxy-lock.spec.ts; here every tool is approved.
const approveAllLock = {
  sync: async (tools: typeof fsTools) =>
    new Map(tools.map((t) => [`${t.serverId}__${t.tool.name}`, { status: 'approved', callable: true, currentHash: 'h' }])),
};

describe('/mcp (Streamable HTTP, stateless)', () => {
  let app: INestApplication;
  let url: URL;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        ProxyService,
        McpClientTokenGuard,
        { provide: UpstreamService, useValue: fakeUpstream },
        { provide: LockEngineService, useValue: approveAllLock },
        { provide: CallLogService, useValue: { record: async () => {} } },
        { provide: ENV, useValue: { MCP_CLIENT_TOKEN: TOKEN } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = new URL(`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/mcp`);
  });

  afterAll(() => app.close());

  async function connect(token = TOKEN): Promise<Client> {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
    );
    return client;
  }

  it('lists upstream tools with prefixed names', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['fs__read_file']);
    await client.close();
  });

  it('forwards tools/call to the right upstream with the unprefixed name', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'fs__read_file', arguments: { path: 'a.txt' } });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ serverId: 'fs', name: 'read_file', args: { path: 'a.txt' } }) },
    ]);
    await client.close();
  });

  it('returns a tool error for unknown tools', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'nope__tool', arguments: {} });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('rejects a missing or wrong bearer token with 401', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    expect((await fetch(url, { method: 'POST', headers, body })).status).toBe(401);
    expect(
      (await fetch(url, { method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body })).status,
    ).toBe(401);
  });

  it('answers GET and DELETE with 405 (stateless mode)', async () => {
    const headers = { authorization: `Bearer ${TOKEN}` };
    expect((await fetch(url, { headers })).status).toBe(405);
    expect((await fetch(url, { method: 'DELETE', headers })).status).toBe(405);
  });
});
