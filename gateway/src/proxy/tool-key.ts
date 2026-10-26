const SEPARATOR = '__';

export function toolKey(serverId: string, toolName: string): string {
  return `${serverId}${SEPARATOR}${toolName}`;
}

/** Splits at the first "__"; server ids may not contain it, tool names may. */
export function parseToolKey(key: string): { serverId: string; toolName: string } | undefined {
  const i = key.indexOf(SEPARATOR);
  if (i <= 0 || i + SEPARATOR.length >= key.length) return undefined;
  return { serverId: key.slice(0, i), toolName: key.slice(i + SEPARATOR.length) };
}
