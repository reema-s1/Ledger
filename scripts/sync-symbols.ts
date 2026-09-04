/**
 * `npm run sync-symbols`
 *
 * Upserts the seed symbol registry (src/seed/symbols.ts) into the
 * `symbols` table. A prerequisite for cluster recompute (needs sector
 * labels for the fallback path) and, later, for ingestion (Section 5).
 */

import { SYMBOLS } from '../src/seed/symbols';
import { upsertSymbol } from '../db/queries/symbols';
import { closePool } from '../db/client';

async function main() {
  for (const s of SYMBOLS) {
    await upsertSymbol({ symbol: s.symbol, name: s.name, sector: s.sector, is_active: true });
  }
  console.log(`Synced ${SYMBOLS.length} symbols.`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
