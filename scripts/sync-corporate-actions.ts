/**
 * `npm run sync-corporate-actions`
 *
 * Loads the seed dataset's known corporate-action fixtures (the 1:5
 * BAJFINANCE split) into the `corporate_actions` table. Stands in for
 * what a real feed would push as vendor notifications arrive; for the
 * replay/demo dataset, the actions are already known deterministically.
 */

import { loadOrGenerateDataset } from '../src/seed/dataset';
import { insertCorporateAction } from '../db/queries/corporate-actions';
import { closePool } from '../db/client';

async function main() {
  const dataset = loadOrGenerateDataset();
  for (const action of dataset.corporateActions) {
    await insertCorporateAction({
      symbol: action.symbol,
      exDate: action.exDate,
      type: action.type,
      ratio: action.ratio,
    });
  }
  console.log(`Synced ${dataset.corporateActions.length} corporate action(s).`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
