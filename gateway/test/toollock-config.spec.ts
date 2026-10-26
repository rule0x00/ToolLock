import { parseToolLockConfig } from '../src/config/toollock-config.js';

describe('parseToolLockConfig', () => {
  it('accepts stdio and url servers and fills policy defaults', () => {
    const config = parseToolLockConfig(
      {
        servers: [
          { id: 'fs', command: 'npx', args: ['-y', 'server'] },
          { id: 'remote', url: 'https://example.com/mcp' },
        ],
      },
      '/base',
    );
    expect(config.servers).toEqual([
      { id: 'fs', command: 'npx', args: ['-y', 'server'] },
      { id: 'remote', url: 'https://example.com/mcp' },
    ]);
    expect(config.policy).toEqual({ autoApproveCosmetic: true, failClosed: true });
    expect(config.baseDir).toBe('/base');
  });

  it.each([
    ['both command and url', { servers: [{ id: 'x', command: 'a', url: 'https://e.com' }] }],
    ['neither command nor url', { servers: [{ id: 'x' }] }],
    ['an id containing "__"', { servers: [{ id: 'a__b', command: 'a' }] }],
    ['duplicate ids', { servers: [{ id: 'a', command: 'a' }, { id: 'a', url: 'https://e.com' }] }],
    ['an invalid url', { servers: [{ id: 'a', url: 'not a url' }] }],
    ['no servers', { servers: [] }],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseToolLockConfig(raw, '/base')).toThrow(/Invalid toollock config/);
  });
});
