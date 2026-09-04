/**
 * Deterministic synthetic market generator. Pure function of
 * `(seedStr, asOf)`: same seed and same reference date always produce the
 * exact same dataset, byte for byte. `asOf` defaults to real "now" rather
 * than a fixed value — the session calendar is anchored to end on the
 * most recent trading day at-or-before `asOf` (see `tradingDatesEndingAt`)
 * so a freshly-generated dataset always has recent-looking dates for
 * Section 6's wall-clock-relative digest tiers. Pass an explicit `asOf`
 * wherever byte-for-byte reproducibility across runs matters (tests,
 * determinism checks).
 *
 * The data has real structure baked in, not just noise:
 *  - every symbol's return is beta * sector-factor + idiosyncratic noise,
 *    and every sector-factor is beta * index-return + sector noise, so
 *    correlation clustering (Section 4) has genuine signal to find.
 *  - two symbols deliberately break from their cluster partway through
 *    (their returns stop depending on the sector factor at all) — the
 *    structural-break fixture for Section 3.
 *  - one symbol carries a real 1:5 split, expressed as raw as-traded
 *    prices (i.e. the overnight -80% discontinuity a naive diff would
 *    see), for Section 5's corporate-action adjustment.
 *  - one symbol carries an isolated volume spike with a matching price
 *    move, for the volume-confirmation fixture in Section 3.
 */

import { SYMBOLS, SECTORS, INDEX_SYMBOL, type SeedSymbol, type Sector } from './symbols';
import { seededRng, gaussian } from './rng';
import { sessionCloseTs as marketCloseTs } from '../lib/time/market-calendar';

// 130 sessions (~6 months) — comfortably past the 90-session minimum
// Section 4's correlation clustering needs to actually engage instead of
// falling back to sector labels every time. The first 20 sessions are
// untouched from the original dataset (the RNG stream is prefix-stable:
// requesting more days never changes the values already drawn for the
// earlier ones), so every previously-verified fixture — the split, the
// spike, both breaks — still lands on the exact same calendar dates.
export const TRADING_DAYS = 130;

// A structural break lasts this many sessions, then the symbol resumes
// tracking its cluster (from wherever it drifted to — no artificial
// reset). Uncapped, a break would compound its persistent per-day drift
// across all 130 sessions into an unrealistic price; bounded, it reads as
// a real localized event, and a rolling correlation window long enough to
// contain the whole break period still finds it.
const BREAK_DURATION_SESSIONS = 15;

export interface SeedCandle {
  symbol: string;
  sessionDate: string;
  /** ISO timestamp of the bar close (15:30 IST). */
  ts: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface StructuralBreakFixture {
  symbol: string;
  /** First session date on which the symbol stops tracking its cluster. */
  fromSessionDate: string;
}

export interface CorporateActionFixture {
  symbol: string;
  exDate: string;
  type: 'split';
  /** 1:ratio, e.g. 5 for a 1:5 split. */
  ratio: number;
}

export interface VolumeSpikeFixture {
  symbol: string;
  sessionDate: string;
  multiple: number;
}

export interface SeedDataset {
  seed: string;
  sessionDates: string[];
  symbols: SeedSymbol[];
  indexSymbol: string;
  /** Raw as-traded candles for every symbol AND the index. */
  candles: SeedCandle[];
  corporateActions: CorporateActionFixture[];
  structuralBreaks: StructuralBreakFixture[];
  volumeSpikes: VolumeSpikeFixture[];
}

interface SectorParams {
  beta: number;
  vol: number;
}

const SECTOR_PARAMS: Record<Sector, SectorParams> = {
  IT: { beta: 0.9, vol: 0.006 },
  Banking: { beta: 1.1, vol: 0.007 },
  'PSU Bank': { beta: 1.3, vol: 0.011 },
  NBFC: { beta: 1.2, vol: 0.01 },
  Pharma: { beta: 0.6, vol: 0.007 },
  Energy: { beta: 1.0, vol: 0.008 },
};

/**
 * `count` trading weekdays ending on the most recent weekday at or before
 * `asOf`, oldest first. Anchored to "now" rather than a fixed calendar
 * date on purpose: Section 6's compaction tiers events by real wall-clock
 * age (< 1 day / 1-7 days / > 7 days), so a dataset frozen at a fixed
 * past date silently goes stale — every session eventually reads as
 * "> 7 days old" and the demo stops showing anything in Today/This week.
 * Regenerating (`npm run seed`) shortly before a demo keeps the tiers
 * populated the way they're meant to be shown.
 */
function tradingDatesEndingAt(asOf: Date, count: number): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.unshift(cursor.toISOString().slice(0, 10));
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return dates;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sessionCloseTs(sessionDate: string): string {
  return marketCloseTs(sessionDate).toISOString();
}

/** Indexed access with a runtime bounds check, for noUncheckedIndexedAccess. */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Index ${i} out of bounds (length ${arr.length})`);
  return v;
}

export function generateDataset(seedStr: string, asOf: Date = new Date()): SeedDataset {
  const rng = seededRng(seedStr);
  const sessionDates = tradingDatesEndingAt(asOf, TRADING_DAYS);

  // --- index returns ---------------------------------------------------
  const indexVol = 0.009;
  const indexReturns = sessionDates.map(() => gaussian(rng) * indexVol);

  // --- sector factors, each correlated with the index -------------------
  const sectorReturns: Record<string, number[]> = {};
  for (const sector of SECTORS) {
    const { beta, vol } = SECTOR_PARAMS[sector];
    sectorReturns[sector] = sessionDates.map((_, d) => beta * at(indexReturns, d) + gaussian(rng) * vol);
  }

  // --- fixtures placed deliberately, not by chance -----------------------
  const structuralBreaks: StructuralBreakFixture[] = [
    { symbol: 'WIPRO', fromSessionDate: at(sessionDates, 11) },
    { symbol: 'FEDERALBNK', fromSessionDate: at(sessionDates, 15) },
  ];
  const breakFromIndex = new Map(
    structuralBreaks.map((b) => [b.symbol, sessionDates.indexOf(b.fromSessionDate)]),
  );

  const volumeSpikes: VolumeSpikeFixture[] = [
    { symbol: 'TATAPOWER', sessionDate: at(sessionDates, 7), multiple: 8 },
  ];

  const split: CorporateActionFixture = {
    symbol: 'BAJFINANCE',
    exDate: at(sessionDates, 14),
    type: 'split',
    ratio: 5,
  };
  const splitIndex = sessionDates.indexOf(split.exDate);

  // --- per-symbol series (adjusted / split-continuous scale) -------------
  const basePrice = new Map<string, number>();
  const baseVolume = new Map<string, number>();
  const symBeta = new Map<string, number>();
  const symIdioVol = new Map<string, number>();

  for (const s of SYMBOLS) {
    basePrice.set(s.symbol, 200 + rng() * 2800); // 200 - 3000
    baseVolume.set(s.symbol, 300_000 + rng() * 6_000_000);
    symBeta.set(s.symbol, 0.7 + rng() * 0.6); // 0.7 - 1.3
    symIdioVol.set(s.symbol, 0.006 + rng() * 0.006); // 0.6% - 1.2%
  }

  const adjustedCloses = new Map<string, number[]>();
  for (const s of SYMBOLS) {
    const beta = symBeta.get(s.symbol)!;
    const idioVol = symIdioVol.get(s.symbol)!;
    const breakIdx = breakFromIndex.get(s.symbol) ?? Infinity;
    let price = basePrice.get(s.symbol)!;
    const closes: number[] = [];
    for (let d = 0; d < sessionDates.length; d++) {
      let r: number;
      if (d >= breakIdx && d < breakIdx + BREAK_DURATION_SESSIONS) {
        // Decoupled: the relationship to its cluster is gone. Idiosyncratic
        // noise plus a small persistent drift, no sector/index dependence.
        r = gaussian(rng) * (idioVol * 1.4) + 0.004;
      } else {
        r = beta * at(sectorReturns[s.sector]!, d) + gaussian(rng) * idioVol;
      }
      price *= 1 + r;
      closes.push(price);
    }
    adjustedCloses.set(s.symbol, closes);
  }

  // --- raw as-traded candles: apply the split as a real discontinuity ---
  const candles: SeedCandle[] = [];
  for (const s of SYMBOLS) {
    const isSplitSymbol = s.symbol === split.symbol;
    const closes = adjustedCloses.get(s.symbol)!;
    for (let d = 0; d < sessionDates.length; d++) {
      const sessionDate = at(sessionDates, d);
      const dayMultiplier = isSplitSymbol && d < splitIndex ? split.ratio : 1;
      const adjClose = at(closes, d);
      const adjPrevClose = d === 0 ? basePrice.get(s.symbol)! : at(closes, d - 1);

      const close = adjClose * dayMultiplier;
      const prevCloseSameScale = adjPrevClose * dayMultiplier;

      const gapNoise = gaussian(rng) * 0.002;
      const open = prevCloseSameScale * (1 + gapNoise);
      const extra = Math.abs(gaussian(rng)) * 0.006;
      const high = Math.max(open, close) * (1 + extra);
      const low = Math.min(open, close) * (1 - extra);

      let volume = baseVolume.get(s.symbol)! * (0.6 + rng() * 0.8);
      if (isSplitSymbol && d < splitIndex) volume /= split.ratio;
      const spike = volumeSpikes.find((v) => v.symbol === s.symbol && v.sessionDate === sessionDate);
      if (spike) volume *= spike.multiple;

      candles.push({
        symbol: s.symbol,
        sessionDate,
        ts: sessionCloseTs(sessionDate),
        o: round2(open),
        h: round2(high),
        l: round2(low),
        c: round2(close),
        v: Math.round(volume),
      });
    }
  }

  // --- index candles -----------------------------------------------------
  let indexPrice = 24000 + rng() * 2000;
  for (let d = 0; d < sessionDates.length; d++) {
    const sessionDate = at(sessionDates, d);
    const prevClose = indexPrice;
    indexPrice *= 1 + at(indexReturns, d);
    const gapNoise = gaussian(rng) * 0.001;
    const open = prevClose * (1 + gapNoise);
    const close = indexPrice;
    const extra = Math.abs(gaussian(rng)) * 0.003;
    const high = Math.max(open, close) * (1 + extra);
    const low = Math.min(open, close) * (1 - extra);
    candles.push({
      symbol: INDEX_SYMBOL,
      sessionDate,
      ts: sessionCloseTs(sessionDate),
      o: round2(open),
      h: round2(high),
      l: round2(low),
      c: round2(close),
      v: 0,
    });
  }

  return {
    seed: seedStr,
    sessionDates,
    symbols: SYMBOLS,
    indexSymbol: INDEX_SYMBOL,
    candles,
    corporateActions: [split],
    structuralBreaks,
    volumeSpikes,
  };
}
