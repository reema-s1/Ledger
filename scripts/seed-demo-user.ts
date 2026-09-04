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

// A wider watchlist than the brief's "12 stocks is usually 3 bets" example
// deliberately increases the odds that, whenever this is regenerated,
// *something* lands in each of the three digest tiers (recent/episode/
// chapter) instead of everything happening to fall into one — since the
// seed dataset's calendar is anchored to "now" (src/seed/generate.ts),
// which symbols carry the freshest events shifts every time `npm run
// seed` runs. BAJFINANCE (the split) and WIPRO (the structural break)
// stay in either way, since those are the fixtures worth showing off
// regardless of timing.
const STARTER_WATCHLIST = [
  'TCS',
  'INFY',
  'WIPRO',
  'HDFCBANK',
  'BAJFINANCE',
  'RELIANCE',
  'TECHM',
  'IDFCFIRSTB',
  'TORNTPHARM',
  'SBIN',
  'ICICIBANK',
  'MPHASIS',
];

async function main() {
  await query(
    `INSERT INTO users (id, display_name) VALUES ($1, 'demo') ON CONFLICT (id) DO NOTHING`,
    [DEMO_USER_ID],
  );
  // Keep the sequence ahead of the fixed id so later real INSERTs don't collide.
  await query(`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users))`);

  for (const symbol of STARTER_WATCHLIST) {
    await addToWatchlist(DEMO_USER_ID, symbol);
  }

  console.log(`Demo user ${DEMO_USER_ID} ready with a ${STARTER_WATCHLIST.length}-symbol watchlist.`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
