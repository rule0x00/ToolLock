import pg from 'pg';
import { migrate } from '../src/db/migrate.js';

const url = process.env.DATABASE_URL;
const schema = `test_migrate_${process.pid}_${Date.now()}`;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('migrate', () => {
  let admin: pg.Pool;
  let pool: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it('applies 001_init.sql and creates the core tables', async () => {
    expect(await migrate(pool)).toEqual(['001_init.sql']);
    const { rows } = await pool.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
      [schema],
    );
    expect(rows.map((r) => r.table_name)).toEqual(['audit_events', 'schema_migrations', 'tool_calls', 'tools']);
  });

  it('is idempotent', async () => {
    expect(await migrate(pool)).toEqual([]);
  });
});
