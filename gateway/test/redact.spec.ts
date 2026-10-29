import { redactArgs } from '../src/proxy/redact.js';

describe('redactArgs', () => {
  it('redacts values whose key matches /pass|secret|token|key|auth/i, at any depth', () => {
    expect(
      redactArgs({
        to: 'a@b.c',
        password: 'p',
        API_KEY: 'k',
        nested: { Authorization: 'Bearer x', list: [{ refresh_token: 't', ok: 1 }] },
        clientSecret: { deep: 'value' },
      }),
    ).toEqual({
      to: 'a@b.c',
      password: '[REDACTED]',
      API_KEY: '[REDACTED]',
      nested: { Authorization: '[REDACTED]', list: [{ refresh_token: '[REDACTED]', ok: 1 }] },
      clientSecret: '[REDACTED]',
    });
  });

  it('passes through undefined and primitives', () => {
    expect(redactArgs(undefined)).toBeUndefined();
    expect(redactArgs('x')).toBe('x');
  });

  it('does not mutate its input', () => {
    const args = { token: 't' };
    redactArgs(args);
    expect(args).toEqual({ token: 't' });
  });
});
