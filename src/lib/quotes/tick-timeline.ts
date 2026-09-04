import type { SeedDataset, SeedCandle } from '../../seed/generate';
import { seededRng } from '../../seed/rng';
import { sessionOpenTs, sessionCloseTs } from '../time/market-calendar';
import type { Tick } from './types';

export interface TimelineEvent {
  ts: Date;
  tick: Tick;
}

/**
 * Expands each day's daily OHLCV bar into `ticksPerSession` intraday
 * price points and merges every symbol's points into one global,
 * chronologically sorted timeline. Deterministic: the intraday path is
 * derived from a seeded RNG keyed by (dataset seed, symbol, session date),
 * so the same dataset always produces the same tick sequence.
 */
export function buildTickTimeline(
  dataset: SeedDataset,
  symbols: Iterable<string>,
  ticksPerSession = 8,
): TimelineEvent[] {
  const wanted = new Set(symbols);
  const bySymbol = new Map<string, SeedCandle[]>();
  for (const c of dataset.candles) {
    if (!wanted.has(c.symbol)) continue;
    const arr = bySymbol.get(c.symbol) ?? [];
    arr.push(c);
    bySymbol.set(c.symbol, arr);
  }

  const events: TimelineEvent[] = [];
  for (const [symbol, candles] of bySymbol) {
    for (const candle of candles) {
      events.push(...ticksForCandle(dataset.seed, symbol, candle, ticksPerSession));
    }
  }

  events.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  return events;
}

function ticksForCandle(seed: string, symbol: string, candle: SeedCandle, ticksPerSession: number): TimelineEvent[] {
  const rng = seededRng(`${seed}:${symbol}:${candle.sessionDate}:ticks`);

  // A plausible intraday path: open -> (high or low, whichever the seed
  // says came first) -> the other extreme -> close.
  const highFirst = rng() < 0.5;
  const waypoints = highFirst
    ? [candle.o, candle.h, candle.l, candle.c]
    : [candle.o, candle.l, candle.h, candle.c];

  const openTs = sessionOpenTs(candle.sessionDate).getTime();
  const closeTs = sessionCloseTs(candle.sessionDate).getTime();
  const events: TimelineEvent[] = [];

  for (let i = 0; i < ticksPerSession; i++) {
    const frac = ticksPerSession === 1 ? 1 : i / (ticksPerSession - 1);
    const price = interpolatePath(waypoints, frac);
    const ts = new Date(openTs + frac * (closeTs - openTs));
    const cumulativeVolume = Math.round(candle.v * frac);

    events.push({
      ts,
      tick: {
        symbol,
        ts,
        price: Math.round(price * 100) / 100,
        volume: cumulativeVolume,
        source: 'replay',
      },
    });
  }

  return events;
}

/** Piecewise-linear interpolation through evenly-spaced waypoints. */
function interpolatePath(waypoints: number[], frac: number): number {
  const segments = waypoints.length - 1;
  const scaled = frac * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const localFrac = scaled - idx;
  const a = waypoints[idx]!;
  const b = waypoints[idx + 1]!;
  return a + (b - a) * localFrac;
}
