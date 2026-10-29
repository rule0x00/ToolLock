import { z } from 'zod';
import { canonicalJson } from './canonical.js';

const lockfileSchema = z.object({
  lockfileVersion: z.literal(1),
  tools: z.record(
    z.string(),
    z.object({
      serverId: z.string(),
      toolName: z.string(),
      hash: z.string().regex(/^[0-9a-f]{64}$/),
      definition: z.record(z.string(), z.unknown()),
    }),
  ),
});

export type Lockfile = z.infer<typeof lockfileSchema>;

export interface LockfileEntry {
  toolKey: string;
  serverId: string;
  toolName: string;
  hash: string;
  definition: Record<string, unknown>;
}

/** Sorted by tool key with canonical definitions, so the serialized file is byte-stable. */
export function buildLockfile(entries: LockfileEntry[]): Lockfile {
  const tools: Lockfile['tools'] = {};
  for (const e of [...entries].sort((a, b) => (a.toolKey < b.toolKey ? -1 : a.toolKey > b.toolKey ? 1 : 0))) {
    tools[e.toolKey] = {
      serverId: e.serverId,
      toolName: e.toolName,
      hash: e.hash,
      definition: JSON.parse(canonicalJson(e.definition)),
    };
  }
  return { lockfileVersion: 1, tools };
}

export function serializeLockfile(lockfile: Lockfile): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}

export function parseLockfile(raw: unknown): Lockfile {
  const result = lockfileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid lockfile: ${issues}`);
  }
  return result.data;
}
