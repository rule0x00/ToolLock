import { parseToolKey, toolKey } from '../src/proxy/tool-key.js';

describe('tool keys', () => {
  it('round-trips and splits at the first "__"', () => {
    expect(toolKey('fs', 'read_file')).toBe('fs__read_file');
    expect(parseToolKey('fs__read__file')).toEqual({ serverId: 'fs', toolName: 'read__file' });
  });

  it.each(['nounderscore', '__tool', 'server__'])('rejects %s', (key) => {
    expect(parseToolKey(key)).toBeUndefined();
  });
});
