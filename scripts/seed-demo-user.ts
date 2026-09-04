/**
 * `npm run seed-demo-user`
 *
 * Ensures the fixed demo user (src/lib/demo-user.ts) exists with a
 * starter watchlist, so `npm run dev` shows something real on first run
 * instead of an empty account with nothing to demonstrate.
 */

import { query, closePool } from '../db/client';
import { DEMO_USER_ID } from '../src/lib/demo-user';
import { addToWatchlist } from '../db/queries/watchlist';
import { STARTER_WATCHLIST } from '../src/lib/starter-watchlist';
import { hashPassword } from '../src/lib/auth';

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo';

async function main() {
  await query(
    `INSERT INTO users (id, display_name) VALUES ($1, 'demo') ON CONFLICT (id) DO NOTHING`,
    [DEMO_USER_ID],
  );
  // Keep the sequence ahead of the fixed id so later real INSERTs don't collide.
  await query(`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users))`);

  // Login-able, so a reviewer can sign into this same seeded account from
  // a second device/tab and watch cursor reconciliation happen live.
  await query('UPDATE users SET username = $2, password_hash = $3 WHERE id = $1', [
    DEMO_USER_ID,
    DEMO_USERNAME,
    hashPassword(DEMO_PASSWORD),
  ]);

  for (const symbol of STARTER_WATCHLIST) {
    await addToWatchlist(DEMO_USER_ID, symbol);
  }

  console.log(`Demo user ${DEMO_USER_ID} ready with a ${STARTER_WATCHLIST.length}-symbol watchlist.`);
  console.log(`Login with username "${DEMO_USERNAME}" / password "${DEMO_PASSWORD}".`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
