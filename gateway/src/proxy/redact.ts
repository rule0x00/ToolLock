const SENSITIVE_KEY = /pass|secret|token|key|auth/i;

/** Copy of `value` with every value under a sensitive-looking key replaced, at any depth. */
export function redactArgs<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactArgs) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[REDACTED]' : redactArgs(v)]),
    ) as T;
  }
  return value;
}
