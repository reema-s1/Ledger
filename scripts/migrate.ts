/**
 * `npm run db:migrate`
 *
 * Minimal migration runner: plain numbered .sql files in db/migrations,
 * applied in filename order inside a transaction each, tracked in a
 * schema_migrations table. No down-migrations, no ORM — this is meant to
 * stay simple, not grow into a framework.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getPool, closePool } from '../db/client';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'migrations');

async function main() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await pool.query<{ id: string }>('SELECT id FROM schema_migrations');
  const appliedIds = new Set(applied.map((r) => r.id));

  let ranCount = 0;
  for (const file of files) {
    if (appliedIds.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      ranCount += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`failed ${file}:`, (err as Error).message);
      throw err;
    } finally {
      client.release();
    }
  }

  if (ranCount === 0) {
    console.log('Nothing to apply — schema is up to date.');
  } else {
    console.log(`Applied ${ranCount} migration(s).`);
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
