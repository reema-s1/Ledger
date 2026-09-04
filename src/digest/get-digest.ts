import { listWatchlist } from '../../db/queries/watchlist';
import { getCursorOrDefault } from '../../db/queries/cursors';
import { getEventsSinceForSymbols, getResolutionStats } from '../../db/queries/events';
import { compactEvents } from './compact';
import { buildReassuranceCards, buildDemoFallbackReassuranceCard, type ReassuranceCard } from './reassurance-cards';
import { attachResolutionNotes } from './resolution-notes';
import { isDemoReassuranceForced } from '../lib/feature-flags';
import type { DigestEvent, DigestItem } from './types';

export interface ResolutionStats {
  held: number;
  partially_reverted: number;
  reverted: number;
  total: number;
}

export interface DigestResult {
  items: DigestItem[];
  cursors: Record<string, number>;
  /** "The market explains this" cards — never seen by compactEvents, assembled separately. */
  reassurance: ReassuranceCard[];
  /** Calibration line ("14 held, 6 reverted") across the last 20 graded alerts, not scoped to this user's watchlist. */
  resolutionStats: ResolutionStats;
}

/**
 * Shared by the GET /api/digest route and the digest page's Server
 * Component, so there's exactly one place that assembles "events since
 * cursor, per watchlisted symbol, compacted." Never advances a cursor.
 */
export async function getDigestForUser(userId: number): Promise<DigestResult> {
  const watchlist = await listWatchlist(userId);
  const resolutionStats = await getResolutionStats(20);
  if (watchlist.length === 0) {
    const reassurance = isDemoReassuranceForced() ? [buildDemoFallbackReassuranceCard(new Date())] : [];
    return { items: [], cursors: {}, reassurance, resolutionStats };
  }

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

  // Neither 'reassurance' nor 'resolution' events ever reach
  // compactEvents — that function, and every card it produces, is
  // untouched by either feature. Both are assembled/attached separately.
  const reassuranceEvents = digestEvents.filter((e) => e.kind === 'reassurance');
  const resolutionEvents = digestEvents.filter((e) => e.kind === 'resolution');
  const flaggedEvents = digestEvents.filter((e) => e.kind !== 'reassurance' && e.kind !== 'resolution');

  const now = new Date();
  const compacted = compactEvents(flaggedEvents, now);
  const items = attachResolutionNotes(compacted, resolutionEvents, now);
  const realReassurance = buildReassuranceCards(reassuranceEvents, now);
  const reassurance =
    realReassurance.length === 0 && isDemoReassuranceForced()
      ? [buildDemoFallbackReassuranceCard(now)]
      : realReassurance;

  const cursors: Record<string, number> = {};
  for (const c of cursorEntries) cursors[c.symbol] = c.sinceEventId;

  return { items, cursors, reassurance, resolutionStats };
}
