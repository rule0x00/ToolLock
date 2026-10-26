import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const serverId = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, 'only letters, digits, "_" and "-"')
  .refine((id) => !id.includes('__'), 'must not contain "__" (the tool-key separator)');

const stdioServer = z.strictObject({
  id: serverId,
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
});

const httpServer = z.strictObject({
  id: serverId,
  url: z.string().url(),
});

export const toolLockConfigSchema = z
  .object({
    servers: z.array(z.union([stdioServer, httpServer])).min(1),
    policy: z
      .object({
        autoApproveCosmetic: z.boolean().default(true),
        failClosed: z.boolean().default(true),
      })
      .default({ autoApproveCosmetic: true, failClosed: true }),
  })
  .refine((c) => new Set(c.servers.map((s) => s.id)).size === c.servers.length, 'server ids must be unique');

export type ToolLockConfig = z.infer<typeof toolLockConfigSchema> & {
  /** Directory of the config file; relative paths (stdio cwd) resolve against it. */
  baseDir: string;
};
export type UpstreamServerConfig = ToolLockConfig['servers'][number];

export function parseToolLockConfig(raw: unknown, baseDir: string): ToolLockConfig {
  const result = toolLockConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid toollock config: ${issues}`);
  }
  return { ...result.data, baseDir };
}

export function loadToolLockConfig(file: string): ToolLockConfig {
  const absolute = path.resolve(file);
  return parseToolLockConfig(JSON.parse(readFileSync(absolute, 'utf8')), path.dirname(absolute));
}
