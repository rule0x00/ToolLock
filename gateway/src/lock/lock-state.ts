export type ToolStatus = 'approved' | 'pending' | 'rejected';

export interface StoredToolState {
  status: ToolStatus;
  approvedHash: string | null;
  currentHash: string;
}

/**
 * What an upstream definition means for a tool, given what's stored:
 * - `new`: never seen → insert as pending and review against nothing
 * - `unchanged`: same hash as last seen → keep the current status
 * - `reverted`: back to the approved hash → approved again, no review needed
 * - `changed`: anything else → pending and review against the approved version
 */
export type ToolTransition = 'new' | 'unchanged' | 'reverted' | 'changed';

export function classifyTool(stored: StoredToolState | undefined, hash: string): ToolTransition {
  if (!stored) return 'new';
  if (stored.currentHash === hash) return 'unchanged';
  if (stored.approvedHash === hash) return 'reverted';
  return 'changed';
}
