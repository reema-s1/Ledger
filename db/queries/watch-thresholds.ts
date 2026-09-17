import { query } from '../client';
import { getRecentCandles, getCandle } from './candles';
import { getCursorOrDefault } from './cursors';
import { getEvent } from './events';
import { istDateString } from '../../src/lib/time/market-calendar';

export interface WatchThresholdRow {
  user_id: number;
  symbol: string;
  threshold_pct: number;
  created_at: Date;
}

/** Sets (or replaces) a user's personal move-size reminder for one symbol. A manual override, never fed into the significance engine. */
export async function setWatchThreshold(userId: number, symbol: string, thresholdPct: number): Promise<void> {
  await query(
    `INSERT INTO watch_thresholds (user_id, symbol, threshold_pct)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, symbol) DO UPDATE SET threshold_pct = $3`,
    [userId, symbol, thresholdPct],
  );
}

export async function removeWatchThreshold(userId: number, symbol: string): Promise<void> {
  await query('DELETE FROM watch_thresholds WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
}

/** Every personal threshold this user has set, keyed by symbol — the watchlist table reads this to render its own badge, separate from significance. */
export async function listWatchThresholds(userId: number): Promise<Map<string, number>> {
  const rows = await query<{ symbol: string; threshold_pct: number }>(
    'SELECT symbol, threshold_pct FROM watch_thresholds WHERE user_id = $1',
    [userId],
  );
  return new Map(rows.map((r) => [r.symbol, Number(r.threshold_pct)]));
}

export interface TriggeredThreshold {
  symbol: string;
  thresholdPct: number;
  changePct: number;
}

// Matches app/watchlist/rows.ts's own CANDLE_WINDOW_DAYS exactly — a
// cursor of 0 (never acknowledged anything) falls back to "the oldest
// candle in this same window" as the baseline in both places, so a fresh
// guest's first-ever reminder agrees with what the row right next to it
// already says, rather than the bell silently treating "never checked" as
// "nothing to compare" while the row happily shows a real percentage.
const CANDLE_WINDOW_DAYS = 130;

/**
 * Which of a user's personal thresholds are exceeded by the move *since
 * they last checked that symbol* — the same figure the watchlist row's
 * own "+5% since you left" already shows (app/watchlist/rows.ts's
 * sinceCursorPct) — for the nav bell (app/components/nav.tsx), so a
 * triggered reminder is visible from every page, not only /watchlist.
 *
 * Was today's raw 1D move instead, which silently disagreed with the
 * number the watchlist row puts right next to the same reminder pill: a
 * slow multi-day slide past the threshold showed "since you left" in red
 * but never rang the bell, because no single day's move alone had cleared
 * it.
 */
export async function getTriggeredThresholds(userId: number): Promise<TriggeredThreshold[]> {
  const thresholds = await listWatchThresholds(userId);
  if (thresholds.size === 0) return [];

  const results = await Promise.all(
    [...thresholds.entries()].map(async ([symbol, thresholdPct]): Promise<TriggeredThreshold | null> => {
      const cursor = await getCursorOrDefault(userId, symbol);

      let baseline: { c: number } | null;
      let latest: { c: number } | null;

      if (cursor === 0) {
        const candles = await getRecentCandles(symbol, CANDLE_WINDOW_DAYS);
        if (candles.length === 0) return null;
        baseline = candles[0]!;
        latest = candles[candles.length - 1]!;
      } else {
        const [cursorEvent, latestCandles] = await Promise.all([getEvent(cursor), getRecentCandles(symbol, 1)]);
        latest = latestCandles[0] ?? null;
        if (!cursorEvent || !latest) return null;
        baseline = await getCandle(symbol, istDateString(cursorEvent.ts));
        if (!baseline) return null;
      }

      const changePct = ((latest.c - baseline.c) / baseline.c) * 100;
      return Math.abs(changePct) >= thresholdPct ? { symbol, thresholdPct, changePct } : null;
    }),
  );
  return results.filter((r): r is TriggeredThreshold => r !== null);
}
