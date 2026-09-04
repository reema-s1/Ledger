/**
 * GET /api/playback?date=YYYY-MM-DD
 *
 * "What the digest would have looked like on this day" — reuses the same
 * pure compaction/resolution-note functions the real digest uses
 * (src/digest/compact.ts, src/digest/resolution-notes.ts), just fed
 * events up to an arbitrary historical date instead of "now" and not
 * cursor-filtered (this is a replay, not a read/unread view). No new
 * significance computation, no new tables.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isPlaybackEnabled } from '../../../src/lib/feature-flags';
import { hasSession, getCurrentUserId } from '../../../src/lib/current-user';
import { listWatchlist } from '../../../db/queries/watchlist';
import { getEventsForSymbolsUpTo } from '../../../db/queries/events';
import { getClustersAsOf } from '../../../db/queries/clusters';
import { compactEvents } from '../../../src/digest/compact';
import { attachResolutionNotes } from '../../../src/digest/resolution-notes';
import type { DigestEvent } from '../../../src/digest/types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  if (!isPlaybackEnabled()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!(await hasSession())) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get('date');
  if (!dateParam || !DATE_PATTERN.test(dateParam)) {
    return NextResponse.json({ error: 'date=YYYY-MM-DD query param is required' }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const watchlist = await listWatchlist(userId);
  const symbols = watchlist.map((w) => w.symbol);

  const asOf = new Date(`${dateParam}T23:59:59.999Z`);
  const [rawEvents, clusters] = await Promise.all([
    getEventsForSymbolsUpTo(symbols, asOf.toISOString()),
    getClustersAsOf(dateParam),
  ]);

  const digestEvents: DigestEvent[] = rawEvents.map((e) => ({
    id: e.id,
    symbol: e.symbol,
    ts: e.ts,
    kind: e.kind,
    payload: e.payload,
    significance: e.significance,
    explanation: e.explanation,
  }));

  // Same split as get-digest.ts: reassurance/resolution never reach compactEvents.
  const flagged = digestEvents.filter((e) => e.kind !== 'reassurance' && e.kind !== 'resolution');
  const resolutions = digestEvents.filter((e) => e.kind === 'resolution');
  const compacted = compactEvents(flagged, asOf);
  const items = attachResolutionNotes(compacted, resolutions, asOf);

  return NextResponse.json({ date: dateParam, items, clusters });
}
