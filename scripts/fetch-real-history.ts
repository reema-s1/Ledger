/**
 * npm run fetch-real-history
 *
 * One-time batch fetch of real historical daily OHLCV (and any real split
 * events) for the seed symbol universe (src/seed/symbols.ts) plus the
 * NIFTY index, from Yahoo Finance's public chart endpoint (.NS tickers,
 * ^NSEI for the index — no API key). Writes a static snapshot to
 * data/real-nse-history.json, committed to the repo — this is a one-time
 * fetch, not a live dependency, so a Vercel build never depends on Yahoo
 * being reachable at build time. Re-run manually to refresh the window.
 *
 * `npm run seed` prefers this file automatically when present and falls
 * back to the synthetic generator (src/seed/generate.ts, untouched) when
 * it isn't — delete data/real-nse-history.json to revert instantly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SYMBOLS, INDEX_SYMBOL } from '../src/seed/symbols';
import { DEFAULT_SEED } from '../src/seed/dataset';
import { istDateString, sessionCloseTs } from '../src/lib/time/market-calendar';
import type { SeedCandle, SeedDataset, CorporateActionFixture } from '../src/seed/generate';

const YAHOO_TICKER: Record<string, string> = Object.fromEntries(SYMBOLS.map((s) => [s.symbol, `${s.symbol}.NS`]));
YAHOO_TICKER[INDEX_SYMBOL] = '^NSEI';

const RANGE = '2y';
// Deliberately wider than src/seed/generate.ts's TRADING_DAYS (130, the
// synthetic fallback's window): every tuned significance/clustering
// window (src/significance/config.ts's largest is betaWindow/
// residualStdevWindow at 60 sessions) fits comfortably inside either
// size, since those are trailing windows evaluated at the *end* of the
// dataset, not the whole-dataset length. The extra sessions here exist
// so a real corporate action further back (e.g. KOTAKBANK's 5:1 split)
// falls inside the fetched window instead of the adjustment logic
// existing in code but never actually triggering against real data.
const TARGET_SESSIONS = 220;
const MIN_SESSIONS = 90;

interface YahooQuote {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

interface YahooChartResult {
  meta: { symbol: string };
  timestamp?: number[];
  indicators: { quote: [YahooQuote] };
  events?: { splits?: Record<string, { date: number; numerator: number; denominator: number }> };
}

async function fetchYahoo(ticker: string): Promise<YahooChartResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${RANGE}&interval=1d&events=div,splits`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) {
    console.error(`  ${ticker}: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as { chart: { result: YahooChartResult[] | null; error: unknown } };
  const result = body.chart.result?.[0];
  if (!result || !result.timestamp) {
    console.error(`  ${ticker}: no result (${JSON.stringify(body.chart.error)})`);
    return null;
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const candles: SeedCandle[] = [];
  const corporateActions: CorporateActionFixture[] = [];
  const failures: string[] = [];
  const perSymbolSessionDates = new Map<string, Set<string>>();

  const allSymbols = [...SYMBOLS.map((s) => s.symbol), INDEX_SYMBOL];

  for (const symbol of allSymbols) {
    const ticker = YAHOO_TICKER[symbol]!;
    process.stdout.write(`Fetching ${symbol} (${ticker})...`);
    const result = await fetchYahoo(ticker);
    if (!result || !result.timestamp) {
      console.log(' FAILED');
      failures.push(symbol);
      await sleep(300);
      continue;
    }

    const quote = result.indicators.quote[0];
    const dates = new Set<string>();
    for (let i = 0; i < result.timestamp.length; i++) {
      const o = quote.open[i];
      const h = quote.high[i];
      const l = quote.low[i];
      const c = quote.close[i];
      const v = quote.volume[i];
      // Yahoo returns null for the rare session with no trade data — skip
      // it rather than fabricate a bar; a real gap should read as a gap.
      if (o == null || h == null || l == null || c == null || v == null) continue;
      const ts = new Date(result.timestamp[i]! * 1000);
      const sessionDate = istDateString(ts);
      dates.add(sessionDate);
      candles.push({
        symbol,
        sessionDate,
        ts: sessionCloseTs(sessionDate).toISOString(),
        o: Math.round(o * 100) / 100,
        h: Math.round(h * 100) / 100,
        l: Math.round(l * 100) / 100,
        c: Math.round(c * 100) / 100,
        v: Math.round(v),
      });
    }
    perSymbolSessionDates.set(symbol, dates);

    if (result.events?.splits) {
      for (const split of Object.values(result.events.splits)) {
        corporateActions.push({
          symbol,
          exDate: istDateString(new Date(split.date * 1000)),
          type: 'split',
          ratio: split.numerator / split.denominator,
        });
      }
    }

    const splitCount = result.events?.splits ? Object.keys(result.events.splits).length : 0;
    console.log(` ${dates.size} sessions${splitCount ? `, ${splitCount} split(s)` : ''}`);
    await sleep(300); // one-time fetch, not a live dependency — no need to hammer an unofficial endpoint
  }

  // A symbol whose Yahoo ticker can't be resolved at all (e.g. a recent
  // rename/merger Yahoo hasn't mapped under the obvious .NS symbol) is
  // dropped from the real-data output, loudly, rather than blocking every
  // other symbol's real data over one unresolved ticker. symbols.ts itself
  // is untouched, so reverting to synthetic mode brings it straight back.
  const okSymbols = allSymbols.filter((s) => !failures.includes(s));
  if (failures.length > 0) {
    console.error(`\nDropping from the real dataset (ticker not found): ${failures.join(', ')}`);
  }
  if (okSymbols.length === 0) {
    console.error('No symbols fetched successfully. Aborting.');
    process.exit(1);
  }

  // Real tickers aren't perfectly date-aligned (listing gaps, corporate
  // events). Use the intersection of session dates present for every
  // successfully-fetched symbol, so every candle in the final window has
  // real data for all of them — exactly what clustering (pairwise
  // correlation) needs.
  const dateSets = okSymbols.map((s) => perSymbolSessionDates.get(s)!);
  const commonDates = [...dateSets[0]!].filter((d) => dateSets.every((set) => set.has(d))).sort();
  const sessionDates = commonDates.slice(-TARGET_SESSIONS);

  if (sessionDates.length < MIN_SESSIONS) {
    console.error(`Only ${sessionDates.length} common trading sessions across all symbols — need at least ${MIN_SESSIONS}. Aborting.`);
    process.exit(1);
  }

  const sessionDateSet = new Set(sessionDates);
  const trimmedCandles = candles.filter((c) => sessionDateSet.has(c.sessionDate));
  const firstDate = sessionDates[0]!;
  const lastDate = sessionDates[sessionDates.length - 1]!;
  const trimmedActions = corporateActions.filter((a) => a.exDate >= firstDate && a.exDate <= lastDate);

  const dataset: SeedDataset = {
    // Same seed string synthetic mode defaults to, deliberately — every
    // other caller of loadOrGenerateDataset() (the worker, cluster
    // recompute, sync scripts) requests DEFAULT_SEED with no override, and
    // matches strictly against what's on disk. A different seed string
    // here would make each of those silently regenerate synthetic data
    // and clobber this file right back — real vs synthetic is told apart
    // by data/real-nse-history.json's presence (see scripts/seed.ts's log
    // line), not by this field.
    seed: DEFAULT_SEED,
    sessionDates,
    symbols: SYMBOLS.filter((s) => okSymbols.includes(s.symbol)),
    indexSymbol: INDEX_SYMBOL,
    candles: trimmedCandles,
    corporateActions: trimmedActions,
    // Real data — no fabricated fixture to report. The significance engine
    // detects whatever structural breaks/spikes actually exist in the real
    // candles at read time; it never reads these arrays directly (only
    // scripts/seed.ts's console summary does).
    structuralBreaks: [],
    volumeSpikes: [],
  };

  const outPath = path.resolve(process.cwd(), 'data', 'real-nse-history.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));

  console.log(
    `\nWrote ${trimmedCandles.length} real candles (${sessionDates.length} sessions, ${firstDate} to ${lastDate}) to ${outPath}`,
  );
  console.log(
    `Real corporate actions found: ${
      trimmedActions.length ? trimmedActions.map((a) => `${a.symbol} ${a.type} ${a.ratio}:1 on ${a.exDate}`).join(', ') : 'none in this window'
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
