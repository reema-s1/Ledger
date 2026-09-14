import { query } from '../client';
import { getRecentCandles } from './candles';

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

/**
 * Which of a user's personal thresholds today's real 1D move actually
 * exceeds — for the nav bell (app/components/nav.tsx), so a triggered
 * reminder is visible from every page, not only /watchlist. Deliberately
 * cheap (2 candles per symbol, not the full sparkline/range/event history
 * app/watchlist/rows.ts fetches) since this runs on every page load via
 * the root layout, for however many thresholds a user happens to have —
 * usually a handful, never the whole watchlist.
 */
export async function getTriggeredThresholds(userId: number): Promise<TriggeredThreshold[]> {
  const thresholds = await listWatchThresholds(userId);
  if (thresholds.size === 0) return [];

  const results = await Promise.all(
    [...thresholds.entries()].map(async ([symbol, thresholdPct]): Promise<TriggeredThreshold | null> => {
      const candles = await getRecentCandles(symbol, 2);
      if (candles.length < 2) return null;
      const [prior, latest] = candles;
      const changePct = ((latest!.c - prior!.c) / prior!.c) * 100;
      return Math.abs(changePct) >= thresholdPct ? { symbol, thresholdPct, changePct } : null;
    }),
  );
  return results.filter((r): r is TriggeredThreshold => r !== null);
}
