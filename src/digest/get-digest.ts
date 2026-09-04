import { listWatchlist } from '../../db/queries/watchlist';
import { getCursorOrDefault } from '../../db/queries/cursors';
import { getEventsSinceForSymbols } from '../../db/queries/events';
import { compactEvents } from './compact';
import type { DigestEvent, DigestItem } from './types';

export interface DigestResult {
  items: DigestItem[];
  cursors: Record<string, number>;
}

/**
 * Shared by the GET /api/digest route and the digest page's Server
 * Component, so there's exactly one place that assembles "events since
 * cursor, per watchlisted symbol, compacted." Never advances a cursor.
 */
export async function getDigestForUser(userId: number): Promise<DigestResult> {
  const watchlist = await listWatchlist(userId);
  if (watchlist.length === 0) return { items: [], cursors: {} };

  const cursorEntries = await Promise.all(
    watchlist.map(async (w) => ({
      symbol: w.symbol,
      sinceEventId: await getCursorOrDefault(userId, w.symbol),
    })),
  );

  const events = await getEventsSinceForSymbols(cursorEntries);
  const digestEvents: DigestEvent[] = events.map((e) => ({
    id: e.id,
    symbol: e.symbol,
    ts: e.ts,
    kind: e.kind,
    payload: e.payload,
    significance: e.significance,
    explanation: e.explanation,
  }));

  const items = compactEvents(digestEvents, new Date());

  const cursors: Record<string, number> = {};
  for (const c of cursorEntries) cursors[c.symbol] = c.sinceEventId;

  return { items, cursors };
}
