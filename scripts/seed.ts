import fs from 'node:fs';
import path from 'node:path';
import { generateDataset, type SeedDataset } from '../src/seed/generate';
import { writeDataset, DEFAULT_SEED } from '../src/seed/dataset';

// Prefers a committed real-data snapshot (npm run fetch-real-history) when
// present; falls back to the synthetic generator otherwise, always loudly
// — a missing real-data file should never silently produce a different
// kind of dataset without saying so. Delete data/real-nse-history.json to
// revert to synthetic instantly; nothing else about this script changes.
const realHistoryPath = path.resolve(process.cwd(), 'data', 'real-nse-history.json');

let dataset: SeedDataset;
if (fs.existsSync(realHistoryPath)) {
  dataset = JSON.parse(fs.readFileSync(realHistoryPath, 'utf-8')) as SeedDataset;
  console.log(`Using REAL historical data (${realHistoryPath}).`);
} else {
  const seed = process.env.LEDGER_SEED || DEFAULT_SEED;
  dataset = generateDataset(seed);
  console.log(
    `${realHistoryPath} not found — falling back to SYNTHETIC generated data. Run \`npm run fetch-real-history\` to produce real data.`,
  );
}

writeDataset(dataset);

const symbolCount = dataset.symbols.length;
const dayCount = dataset.sessionDates.length;

console.log(`Seed: ${dataset.seed}`);
console.log(
  `${dataset.candles.length} candles: ${symbolCount} symbols + index, ` +
    `${dayCount} sessions (${dataset.sessionDates[0]} to ${dataset.sessionDates[dayCount - 1]}).`,
);
console.log(
  `Structural breaks: ${
    dataset.structuralBreaks.length
      ? dataset.structuralBreaks.map((b) => `${b.symbol} from ${b.fromSessionDate}`).join(', ')
      : 'none (planted fixtures only exist in synthetic mode — real data is analyzed as-is)'
  }`,
);
console.log(
  `Corporate actions: ${
    dataset.corporateActions.length
      ? dataset.corporateActions.map((a) => `${a.symbol} ${a.type} 1:${a.ratio} on ${a.exDate}`).join(', ')
      : 'none'
  }`,
);
console.log(
  `Volume spikes: ${
    dataset.volumeSpikes.length ? dataset.volumeSpikes.map((v) => `${v.symbol} ${v.multiple}x on ${v.sessionDate}`).join(', ') : 'none'
  }`,
);
console.log(`Written to data/seed-dataset.json`);
