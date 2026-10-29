import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { ToolDefinition } from '../lock/canonical.js';

export interface ReviewRequest {
  serverId: string;
  toolName: string;
  oldDefinition: ToolDefinition | null;
  newDefinition: ToolDefinition;
}

const reviewResultSchema = z.object({
  verdict: z.enum(['SAFE_COSMETIC', 'NEW_CAPABILITY', 'SUSPICIOUS']),
  risk: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  signals: z.array(z.string()),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;

/** The reviewer could not produce a trustworthy verdict (down, slow, or malformed reply). */
export class ReviewerUnavailableError extends Error {}

/** Client for the Python reviewer's POST /review. Every failure is a ReviewerUnavailableError (callers fail closed). */
@Injectable()
export class ReviewerClientService {
  timeoutMs = 10_000;

  constructor(@Inject(ENV) private readonly env: Pick<Env, 'REVIEWER_URL'>) {}

  async review(request: ReviewRequest): Promise<ReviewResult> {
    if (!this.env.REVIEWER_URL) throw new ReviewerUnavailableError('REVIEWER_URL is not set');
    let response: Response;
    try {
      response = await fetch(new URL('/review', this.env.REVIEWER_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ReviewerUnavailableError(`Reviewer request failed: ${(err as Error).message}`);
    }
    if (!response.ok) throw new ReviewerUnavailableError(`Reviewer returned HTTP ${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ReviewerUnavailableError('Reviewer returned invalid JSON');
    }
    const parsed = reviewResultSchema.safeParse(body);
    if (!parsed.success) throw new ReviewerUnavailableError(`Reviewer returned an invalid result: ${parsed.error.message}`);
    return parsed.data;
  }
}
