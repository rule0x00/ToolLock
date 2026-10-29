import { buildLockfile, parseLockfile, serializeLockfile } from '../src/lock/lockfile.js';

describe('lockfile', () => {
  const rows = [
    { toolKey: 'mailer__send_email', serverId: 'mailer', toolName: 'send_email', hash: 'b'.repeat(64), definition: { name: 'send_email', description: 'x' } },
    { toolKey: 'fs__read_file', serverId: 'fs', toolName: 'read_file', hash: 'a'.repeat(64), definition: { name: 'read_file', inputSchema: { type: 'object' } } },
  ];

  it('is sorted by tool key with canonical definitions, so output is byte-stable', () => {
    const text = serializeLockfile(buildLockfile(rows));
    expect(text).toBe(serializeLockfile(buildLockfile([...rows].reverse())));
    expect(Object.keys(JSON.parse(text).tools)).toEqual(['fs__read_file', 'mailer__send_email']);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('round-trips through parseLockfile', () => {
    const lockfile = buildLockfile(rows);
    expect(parseLockfile(JSON.parse(serializeLockfile(lockfile)))).toEqual(lockfile);
  });

  it('rejects malformed lockfiles', () => {
    expect(() => parseLockfile({ lockfileVersion: 2, tools: {} })).toThrow(/Invalid lockfile/);
    expect(() => parseLockfile({ lockfileVersion: 1, tools: { k: { hash: 'nothex' } } })).toThrow(/Invalid lockfile/);
  });
});
