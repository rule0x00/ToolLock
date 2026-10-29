import { AuditService, computeEventHash, GENESIS_HASH } from '../src/audit/audit.service.js';
import { createTestDb, describeIfDb, type TestDb } from './helpers/db.js';

describeIfDb('AuditService (hash chain)', () => {
  let db: TestDb;
  let audit: AuditService;

  beforeEach(async () => {
    db = await createTestDb();
    audit = new AuditService(db.pool);
  });
  afterEach(() => db.close());

  const appendThree = async () => {
    await audit.append({ actor: 'cli', action: 'LOCK_INIT', payload: { tools: { fs__read_file: 'a'.repeat(64) } } });
    await audit.append({ actor: 'gateway', action: 'TOOL_CHANGED', toolKey: 'fs__read_file', payload: { newHash: 'b'.repeat(64) } });
    await audit.append({ actor: 'alice', action: 'APPROVED', toolKey: 'fs__read_file', payload: { hash: 'b'.repeat(64) } });
    return (await db.pool.query('SELECT id FROM audit_events ORDER BY id')).rows.map((r) => Number(r.id));
  };

  it('chains each event to the previous one, starting from the genesis hash', async () => {
    const first = await audit.append({ actor: 'cli', action: 'LOCK_INIT', payload: { n: 1 } });
    const second = await audit.append({ actor: 'alice', action: 'APPROVED', toolKey: 'k', payload: { n: 2 } });

    expect(first.prevHash).toBe(GENESIS_HASH);
    expect(second.prevHash).toBe(first.hash);
    expect(second.hash).toBe(
      computeEventHash(first.hash, { ts: second.ts, actor: 'alice', action: 'APPROVED', toolKey: 'k', payload: { n: 2 } }),
    );
  });

  it('verifies an empty chain and an intact chain', async () => {
    expect(await audit.verify()).toEqual({ ok: true, count: 0 });
    await appendThree();
    expect(await audit.verify()).toEqual({ ok: true, count: 3 });
  });

  it.each([
    ['payload', `payload = '{"hash": "evil"}'`],
    ['actor', `actor = 'mallory'`],
    ['action', `action = 'REJECTED'`],
    ['tool_key', `tool_key = 'other__tool'`],
    ['timestamp', `ts = ts + interval '1 second'`],
  ])('detects a tampered %s at the edited row', async (_field, set) => {
    const ids = await appendThree();
    await db.pool.query(`UPDATE audit_events SET ${set} WHERE id = $1`, [ids[1]]);
    expect(await audit.verify()).toEqual({ ok: false, brokenAtId: ids[1] });
  });

  it('detects a deleted row at the row after it', async () => {
    const ids = await appendThree();
    await db.pool.query('DELETE FROM audit_events WHERE id = $1', [ids[1]]);
    expect(await audit.verify()).toEqual({ ok: false, brokenAtId: ids[2] });
  });

  it('detects a row whose hash was recomputed to hide an edit (the next link breaks)', async () => {
    const ids = await appendThree();
    const { rows } = await db.pool.query('SELECT * FROM audit_events WHERE id = $1', [ids[1]]);
    const row = rows[0];
    const forged = computeEventHash(row.prev_hash, {
      ts: row.ts.toISOString(),
      actor: row.actor,
      action: row.action,
      toolKey: row.tool_key,
      payload: { newHash: 'forged' },
    });
    await db.pool.query(`UPDATE audit_events SET payload = '{"newHash": "forged"}', hash = $2 WHERE id = $1`, [ids[1], forged]);
    expect(await audit.verify()).toEqual({ ok: false, brokenAtId: ids[2] });
  });

  it('serializes concurrent appends into one valid chain', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => audit.append({ actor: 'gateway', action: 'CALL_BLOCKED', toolKey: `t${i}`, payload: { i } })),
    );
    expect(await audit.verify()).toEqual({ ok: true, count: 25 });
    const { rows } = await db.pool.query('SELECT count(DISTINCT prev_hash)::int AS n FROM audit_events');
    expect(rows[0].n).toBe(25);
  });

  it("joins the caller's transaction, so a rollback drops the event", async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await audit.append({ actor: 'cli', action: 'LOCK_INIT', payload: {} }, client);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await audit.verify()).toEqual({ ok: true, count: 0 });
  });

  it('lists the newest events first', async () => {
    await appendThree();
    const events = await audit.list(2);
    expect(events.map((e) => e.action)).toEqual(['APPROVED', 'TOOL_CHANGED']);
  });
});
