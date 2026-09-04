/**
 * Thin typed wrapper over `pg`. No ORM — plain SQL everywhere, this module
 * just owns the pool, parameter binding, and type-parser fixes so
 * numeric/bigint/date columns come back as the JS types the rest of the
 * codebase actually expects.
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool, types } = pg;

// OID 1700 = numeric, OID 20 = int8/bigint. Safe here: nothing in this
// schema exceeds Number.MAX_SAFE_INTEGER (event ids, volumes, prices).
types.setTypeParser(1700, (val: string) => parseFloat(val));
types.setTypeParser(20, (val: string) => parseInt(val, 10));
// OID 1082 = date. pg's default parser turns this into a JS Date at
// midnight UTC, which every `session_date`/`ex_date` comparison in this
// codebase (string equality, `<=`, template-literal keys) assumes is a
// plain 'YYYY-MM-DD' string — a Date object there compares/stringifies
// wrong and fails silently (found via a corporate-action ex-date match
// that never fired: adjustment never kicked in and a split read as a
// genuine -80% move). Keep it as the raw wire string instead.
types.setTypeParser(1082, (val: string) => val);

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set (copy .env.example to .env).');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a transaction, committing on success and rolling back on throw. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
