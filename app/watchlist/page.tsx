import { listWatchlist } from '../../db/queries/watchlist';
import { listActiveSymbols } from '../../db/queries/symbols';
import { getCurrentUserId } from '../../src/lib/current-user';
import { WatchlistTable, type WatchlistSymbol } from '../components/watchlist-table';
import { buildWatchlistRows } from './rows';

export const dynamic = 'force-dynamic';

export default async function WatchlistPage() {
  const userId = await getCurrentUserId();
  const [watchlist, allSymbols] = await Promise.all([listWatchlist(userId), listActiveSymbols()]);

  const watchlistedSet = new Set(watchlist.map((w) => w.symbol));
  const bySymbol = new Map(allSymbols.map((s) => [s.symbol, s]));

  const current: WatchlistSymbol[] = watchlist
    .map((w) => bySymbol.get(w.symbol))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector }));

  const available: WatchlistSymbol[] = allSymbols
    .filter((s) => !watchlistedSet.has(s.symbol))
    .map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector }));

  const rows = await buildWatchlistRows(userId, current);

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Watchlist</h1>
      <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginTop: 0, marginBottom: 32 }}>
        {current.length} {current.length === 1 ? 'symbol' : 'symbols'} tracked. The dotted line on each chart marks
        where you last left off; the line after it is colored only when the move since then actually cleared the
        significance bar.
      </p>
      <WatchlistTable rows={rows} available={available} />
    </main>
  );
}
