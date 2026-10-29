import pg from 'pg';
import { migrate } from '../../src/db/migrate.js';

export const DATABASE_URL = process.env.DATABASE_URL;
/** `describe` when a database is available, otherwise `describe.skip`. */
export const describeIfDb = DATABASE_URL ? describe : describe.skip;

export interface TestDb {
  pool: pg.Pool;
  close(): Promise<void>;
}

/** A migrated, throwaway schema; `close()` drops it. */
export async function createTestDb(): Promise<TestDb> {
  const schema = `test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Pool({ connectionString: DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(pool);
  return {
    pool,
    async close() {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    },
  };
}
