import { createHash } from 'node:crypto';

/** The tool fields that define its identity; anything else (e.g. `_meta`, `icons`) is ignored. */
export const HASHED_TOOL_FIELDS = ['name', 'title', 'description', 'inputSchema', 'outputSchema', 'annotations'] as const;

export type ToolDefinition = Partial<Record<(typeof HASHED_TOOL_FIELDS)[number], unknown>>;

/**
 * Deterministic JSON: object keys sorted recursively (by UTF-16 code units, like
 * JSON Canonicalization Scheme), no whitespace, array order preserved. Undefined
 * object values are dropped; values JSON can't represent throw instead of being
 * silently changed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Cannot canonicalize non-finite number ${value}`);
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Cannot canonicalize a value of type ${typeof value}`);
  }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Picks the hashed fields, omitting missing or null ones rather than recording null. */
export function toolDefinition(tool: Record<string, unknown>): ToolDefinition {
  const def: ToolDefinition = {};
  for (const field of HASHED_TOOL_FIELDS) {
    const value = tool[field];
    if (value !== undefined && value !== null) def[field] = value;
  }
  return def;
}

export function hashTool(tool: Record<string, unknown>): string {
  return sha256Hex(canonicalJson(toolDefinition(tool)));
}
