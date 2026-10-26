import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseToolLockConfig } from '../src/config/toollock-config.js';
import { UpstreamService } from '../src/upstream/upstream.service.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('UpstreamService (stdio)', () => {
  const config = parseToolLockConfig(
    {
      servers: [
        { id: 'echo', command: process.execPath, args: ['echo-server.mjs'] },
        { id: 'broken', command: 'definitely-not-a-real-binary-xyz' },
      ],
    },
    fixtures,
  );
  const upstream = new UpstreamService(config);

  beforeAll(() => upstream.onModuleInit(), 20_000);
  afterAll(() => upstream.onModuleDestroy());

  it('connects to working servers and skips broken ones', () => {
    expect(upstream.serverIds()).toEqual(['echo']);
  });

  it('lists tools tagged with their server id', async () => {
    const tools = await upstream.listAllTools();
    expect(tools.map((t) => [t.serverId, t.tool.name])).toEqual([['echo', 'echo']]);
  });

  it('calls tools, running the server with the config directory as cwd', async () => {
    const result = await upstream.callTool('echo', 'echo', { text: 'hi' });
    expect(result.content).toEqual([{ type: 'text', text: `echo: hi (cwd=${fixtures})` }]);
  });
});
