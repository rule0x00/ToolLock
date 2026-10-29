import { z } from 'zod';

export const decisionBodySchema = z.object({
  actor: z.string().trim().min(1).max(100),
  /** The current_hash the approver reviewed; the decision is refused (409) if the tool changed since. */
  expectedHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
