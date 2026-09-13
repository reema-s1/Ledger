import { query } from '../client';

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
