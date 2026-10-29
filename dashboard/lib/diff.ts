export type LineKind = 'same' | 'removed' | 'added' | 'empty';

export interface DiffRow {
  left: { text: string; kind: LineKind };
  right: { text: string; kind: LineKind };
}

/** Pretty JSON with object keys sorted at every level, so diffs show real changes only. */
export function stableStringify(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return value === null || value === undefined ? '' : JSON.stringify(sort(value), null, 2);
}

/** Side-by-side line diff (LCS). Small inputs only, which tool definitions are. */
export function sideBySide(oldText: string, newText: string): DiffRow[] {
  const a = oldText ? oldText.split('\n') : [];
  const b = newText ? newText.split('\n') : [];
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    for (let k = 0; k < Math.max(removed.length, added.length); k++) {
      rows.push({
        left: k < removed.length ? { text: removed[k], kind: 'removed' } : { text: '', kind: 'empty' },
        right: k < added.length ? { text: added[k], kind: 'added' } : { text: '', kind: 'empty' },
      });
    }
    removed = [];
    added = [];
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      rows.push({ left: { text: a[i], kind: 'same' }, right: { text: b[j], kind: 'same' } });
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      added.push(b[j++]);
    } else {
      removed.push(a[i++]);
    }
  }
  flush();
  return rows;
}
