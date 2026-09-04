import { generateDataset } from '../src/seed/generate';
import { writeDataset, DEFAULT_SEED } from '../src/seed/dataset';

const seed = process.env.LEDGER_SEED ?? DEFAULT_SEED;
const dataset = generateDataset(seed);
writeDataset(dataset);

const symbolCount = dataset.symbols.length;
const dayCount = dataset.sessionDates.length;

console.log(`Seed: ${dataset.seed}`);
console.log(
  `Generated ${dataset.candles.length} candles: ${symbolCount} symbols + index, ` +
    `${dayCount} sessions (${dataset.sessionDates[0]} to ${dataset.sessionDates[dayCount - 1]}).`,
);
console.log(
  `Structural breaks: ${dataset.structuralBreaks
    .map((b) => `${b.symbol} from ${b.fromSessionDate}`)
    .join(', ')}`,
);
console.log(
  `Corporate actions: ${dataset.corporateActions
    .map((a) => `${a.symbol} ${a.type} 1:${a.ratio} on ${a.exDate}`)
    .join(', ')}`,
);
console.log(
  `Volume spikes: ${dataset.volumeSpikes.map((v) => `${v.symbol} ${v.multiple}x on ${v.sessionDate}`).join(', ')}`,
);
console.log('Written to data/seed-dataset.json');
