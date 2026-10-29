import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  // Required to serve /mcp (checked in bootstrapGateway); CLI commands don't need it.
  MCP_CLIENT_TOKEN: z.string().min(1).optional(),
  ADMIN_TOKEN: z.string().optional(),
  REVIEWER_URL: z.string().url().optional(),
  TOOLLOCK_CONFIG: z.string().default('toollock.config.json'),
  /** Where `init` writes mcp.lock.json (relative to the working directory). */
  LOCKFILE_PATH: z.string().default('mcp.lock.json'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
