import { query } from '../client';

export interface WatchlistItemRow {
  user_id: number;
  symbol: string;
  added_at: Date;
}

export async function addToWatchlist(userId: number, symbol: string): Promise<void> {
  await query(
    `INSERT INTO watchlist_items (user_id, symbol) VALUES ($1, $2)
     ON CONFLICT (user_id, symbol) DO NOTHING`,
    [userId, symbol],
  );
}

export async function removeFromWatchlist(userId: number, symbol: string): Promise<void> {
  await query('DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
}

export async function listWatchlist(userId: number): Promise<WatchlistItemRow[]> {
  return query<WatchlistItemRow>(
    'SELECT * FROM watchlist_items WHERE user_id = $1 ORDER BY added_at',
    [userId],
  );
}

/** How many users have each symbol watchlisted — the input to tiered polling (Section 5). */
export async function getWatchlistCounts(): Promise<Map<string, number>> {
  const rows = await query<{ symbol: string; count: number }>(
    'SELECT symbol, count(*)::int AS count FROM watchlist_items GROUP BY symbol',
  );
  return new Map(rows.map((r) => [r.symbol, r.count]));
}
