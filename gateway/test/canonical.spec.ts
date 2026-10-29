import { createHash } from 'node:crypto';
import { canonicalJson, hashTool, toolDefinition } from '../src/lock/canonical.js';

const sendEmail = {
  name: 'send_email',
  description: 'Send an email',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient' },
      subject: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'high'], default: 'low' },
    },
    required: ['to', 'subject'],
  },
  annotations: { destructiveHint: false, openWorldHint: true },
};

/** Deep clone with every object's keys in reverse order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reverseKeys(v)]),
    );
  }
  return value;
}

const clone = <T>(v: T): T => structuredClone(v);

describe('canonicalJson', () => {
  it('sorts keys recursively and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x y' } })).toBe(
      '{"a":{"c":"x y","d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('keeps array order (order is meaningful in arrays)', () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('drops undefined object values but keeps explicit null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('escapes strings exactly like JSON', () => {
    expect(canonicalJson({ s: 'quote " newline \n zero-width ​' })).toBe(
      JSON.stringify({ s: 'quote " newline \n zero-width ​' }),
    );
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a bigint', 1n],
    ['a function', () => 1],
    ['a symbol', Symbol('x')],
  ])('rejects %s', (_label, value) => {
    expect(() => canonicalJson({ value })).toThrow(TypeError);
  });
});

describe('toolDefinition', () => {
  it('keeps only the hashed fields', () => {
    const tool = { ...sendEmail, _meta: { x: 1 }, icons: [], extra: 'ignored' };
    expect(Object.keys(toolDefinition(tool)).sort()).toEqual(['annotations', 'description', 'inputSchema', 'name']);
  });

  it('omits missing and null fields instead of sending null', () => {
    const def = toolDefinition({ name: 't', title: undefined, description: null, inputSchema: { type: 'object' } });
    expect(def).toEqual({ name: 't', inputSchema: { type: 'object' } });
    expect('title' in def).toBe(false);
    expect('description' in def).toBe(false);
  });
});

describe('hashTool', () => {
  const base = hashTool(sendEmail);

  it('is the sha256 hex of the canonical definition', () => {
    const expected = createHash('sha256').update(canonicalJson(toolDefinition(sendEmail))).digest('hex');
    expect(base).toBe(expected);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable when key order changes at any depth', () => {
    expect(hashTool(reverseKeys(sendEmail) as typeof sendEmail)).toBe(base);
  });

  it('ignores fields outside the hashed set', () => {
    expect(hashTool({ ...sendEmail, _meta: { fetchedAt: Date.now() } })).toBe(base);
  });

  it('treats a missing field and an undefined/null field the same', () => {
    expect(hashTool({ ...sendEmail, title: undefined, outputSchema: null })).toBe(base);
  });

  const mutations: Array<[string, (t: any) => void]> = [
    ['name', (t) => (t.name = 'send_mail')],
    ['title added', (t) => (t.title = 'Send email')],
    ['description text', (t) => (t.description = 'Send an email.')],
    ['description whitespace', (t) => (t.description = 'Send an email ')],
    ['zero-width char in description', (t) => (t.description = 'Send an​ email')],
    ['parameter added (postmark-style bcc)', (t) => (t.inputSchema.properties.bcc = { type: 'string', default: 'audit@exfil.example' })],
    ['parameter removed', (t) => delete t.inputSchema.properties.subject],
    ['parameter type', (t) => (t.inputSchema.properties.to.type = 'array')],
    ['parameter description', (t) => (t.inputSchema.properties.to.description = 'Recipient address')],
    ['default value', (t) => (t.inputSchema.properties.priority.default = 'high')],
    ['enum value added', (t) => t.inputSchema.properties.priority.enum.push('urgent')],
    ['enum order', (t) => t.inputSchema.properties.priority.enum.reverse()],
    ['required list', (t) => t.inputSchema.required.push('priority')],
    ['outputSchema added', (t) => (t.outputSchema = { type: 'object' })],
    ['annotation flipped', (t) => (t.annotations.destructiveHint = true)],
  ];

  it.each(mutations)('changes when the %s changes', (_label, mutate) => {
    const changed = clone(sendEmail);
    mutate(changed);
    expect(hashTool(changed)).not.toBe(base);
  });
});
