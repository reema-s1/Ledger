/**
 * `npm run replay -- --speed 60`
 *
 * Streams the seeded dataset to the console through the same Clock +
 * QuoteSource abstraction the rest of the app will use, so this script
 * doubles as a smoke test for the whole replay pipeline.
 */

import { ReplayClock } from '../src/lib/time/replay-clock';
import { sessionOpenTs } from '../src/lib/time/market-calendar';
import { ReplayQuoteSource } from '../src/lib/quotes/replay-quote-source';
import { loadOrGenerateDataset } from '../src/seed/dataset';
import { SYMBOLS, INDEX_SYMBOL } from '../src/seed/symbols';
import type { Tick } from '../src/lib/quotes/types';

function parseArgs(argv: string[]): { speed: number; symbols?: string[] } {
  let speed = 60;
  let symbols: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--speed') speed = Number(argv[++i]);
    if (argv[i] === '--symbols') symbols = argv[++i]!.split(',').map((s) => s.trim().toUpperCase());
  }
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`--speed must be a positive number, got "${speed}"`);
  }
  return { speed, symbols };
}

function main() {
  const { speed, symbols: symbolFilter } = parseArgs(process.argv.slice(2));
  const dataset = loadOrGenerateDataset();

  const firstSessionDate = dataset.sessionDates[0];
  if (!firstSessionDate) throw new Error('Seed dataset is empty.');
  const clock = new ReplayClock(sessionOpenTs(firstSessionDate));
  const source = new ReplayQuoteSource(clock, { speed });

  const symbols = symbolFilter ?? [...SYMBOLS.map((s) => s.symbol), INDEX_SYMBOL];

  console.log(`Ledger replay — seed "${dataset.seed}", ${symbols.length} symbols, speed ${speed}x`);
  console.log(
    `${dataset.sessionDates.length} sessions: ${dataset.sessionDates[0]} .. ${
      dataset.sessionDates[dataset.sessionDates.length - 1]
    }`,
  );
  console.log('Ctrl+C to stop.\n');

  let tickCount = 0;
  let lastSessionDate = '';

  const unsubscribe = source.subscribe(symbols, (tick: Tick) => {
    tickCount += 1;
    const session = clock.currentSession();
    if (session.date !== lastSessionDate) {
      lastSessionDate = session.date;
      console.log(`\n--- session ${session.date} ---`);
    }
    console.log(
      `${tick.ts.toISOString()}  ${tick.symbol.padEnd(12)} ${tick.price.toFixed(2).padStart(10)}  vol=${tick.volume}`,
    );
  });

  process.on('SIGINT', () => {
    unsubscribe();
    console.log(`\nStopped after ${tickCount} ticks.`);
    process.exit(0);
  });
}

main();
