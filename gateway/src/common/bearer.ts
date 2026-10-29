import { timingSafeEqual } from 'node:crypto';

/** Constant-time check of an `Authorization: Bearer <token>` header. An unset token never matches. */
export function bearerMatches(header: string | undefined, token: string | undefined): boolean {
  if (!token) return false;
  const presented = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
