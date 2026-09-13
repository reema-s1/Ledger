/**
 * Assembles one watchlist table row per symbol from data the read path
 * already exposes elsewhere (candles, events, cursors, freshness) — no
 * new query logic beyond what db/queries/*.ts already exports, just
 * composed together for this one table. Server-only (imports db/queries
 * directly), called from app/watchlist/page.tsx.
 */

import { getRecentCandles, type CandleRow } from '../../db/queries/candles';
import { getRecentEventsForSymbol, getEventsSince } from '../../db/queries/events';
import { getCursorOrDefault } from '../../db/queries/cursors';
import { getWatchlistCounts } from '../../db/queries/watchlist';
import { listWatchThresholds } from '../../db/queries/watch-thresholds';
import { classifyFreshness, classifyQuoteQuality, type QuoteQuality } from '../../worker/freshness';
import { pollingTierFor } from '../../worker/polling-tiers';

const CANDLE_WINDOW_DAYS = 130;
const RECENT_EVENTS_LIMIT = 40;
const MOVE_KINDS = new Set(['residual_move', 'structural_break']);

export interface WatchlistRow {
  symbol: string;
  name: string;
  sector: string;
  latestClose: number | null;
  dayChangePct: number | null;
  /** Did *today's* session clear the significance bar — item 18's "moved vs. moved and mattered" distinction. */
  daySignificant: boolean;
  volume: number | null;
  sparklineValues: number[];
  low: number;
  high: number;
  fromDate: string;
  toDate: string;
  eventIndices: number[];
  cursorIndex: number | null;
  significantSinceCursor: boolean;
  /** "+5% since you left" — null if there's no cursor yet (never read) or no candle at that position. */
  sinceCursorPct: number | null;
  quality: QuoteQuality | null;
  /** A manual, personal reminder (item 19) — never fed into or read from the significance engine. Null if the user hasn't set one for this symbol. */
  personalThresholdPct: number | null;
  /** Whether today's raw |1D change| exceeds the personal threshold — a separate fact from `daySignificant`, never conflated with it. */
  thresholdExceeded: boolean;
}

export async function buildWatchlistRows(
  userId: number,
  symbols: { symbol: string; name: string; sector: string }[],
): Promise<WatchlistRow[]> {
  const [watcherCounts, thresholds] = await Promise.all([getWatchlistCounts(), listWatchThresholds(userId)]);

  return Promise.all(
    symbols.map(async (s): Promise<WatchlistRow> => {
      const [candles, recentEvents, cursor] = await Promise.all([
        getRecentCandles(s.symbol, CANDLE_WINDOW_DAYS),
        getRecentEventsForSymbol(s.symbol, RECENT_EVENTS_LIMIT),
        getCursorOrDefault(userId, s.symbol),
      ]);

      const dateIndex = new Map(candles.map((c, i) => [c.session_date, i]));
      const latest = candles[candles.length - 1];
      const prior = candles[candles.length - 2];

      const eventIndices = recentEvents
        .filter((e) => MOVE_KINDS.has(e.kind))
        .map((e) => dateIndex.get(e.ts.toISOString().slice(0, 10)))
        .filter((i): i is number => i !== undefined);

      const daySignificant = latest
        ? recentEvents.some((e) => MOVE_KINDS.has(e.kind) && e.ts.toISOString().slice(0, 10) === latest.session_date)
        : false;

      // cursor === 0 means "never acknowledged anything for this symbol" —
      // true for every symbol on a fresh watchlist add, and (until a real
      // user starts marking things seen) for this whole demo right now.
      // That's still a real "since you left" story to tell, not nothing:
      // treat it as a cursor sitting at the very start of the loaded
      // window, same as an old cursor that predates the window entirely,
      // rather than skipping the marker/coloring feature altogether.
      let cursorIndex: number | null = candles.length > 0 ? 0 : null;
      let sinceCursorPct: number | null = null;
      let significantSinceCursor = false;
      if (cursor > 0) {
        const cursorEvent = recentEvents.find((e) => e.id === cursor);
        const cursorDate = cursorEvent?.ts.toISOString().slice(0, 10);
        const idx = cursorDate ? dateIndex.get(cursorDate) : undefined;
        cursorIndex = idx ?? 0; // predates the loaded window -> mark the whole window as "since you left"
      }
      const cursorCandle = cursorIndex !== null ? candles[cursorIndex] : undefined;
      if (cursorCandle && latest) {
        sinceCursorPct = ((latest.c - cursorCandle.c) / cursorCandle.c) * 100;
      }
      const since = await getEventsSince(s.symbol, cursor);
      significantSinceCursor = since.some((e) => MOVE_KINDS.has(e.kind));

      const closes = candles.map((c) => c.c);
      const { intervalMs } = pollingTierFor(watcherCounts.get(s.symbol) ?? 0);
      const quality = latest ? classifyQuoteQuality(classifyFreshness(latest.ts, new Date(), intervalMs), latest.confirmed) : null;

      const dayChangePct = latest && prior ? ((latest.c - prior.c) / prior.c) * 100 : null;
      const personalThresholdPct = thresholds.get(s.symbol) ?? null;
      const thresholdExceeded =
        personalThresholdPct !== null && dayChangePct !== null && Math.abs(dayChangePct) >= personalThresholdPct;

      return {
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        latestClose: latest?.c ?? null,
        dayChangePct,
        daySignificant,
        volume: latest?.v ?? null,
        sparklineValues: closes,
        low: closes.length ? Math.min(...closes) : 0,
        high: closes.length ? Math.max(...closes) : 0,
        fromDate: candles[0]?.session_date ?? '',
        toDate: latest?.session_date ?? '',
        eventIndices,
        cursorIndex,
        significantSinceCursor,
        sinceCursorPct,
        quality,
        personalThresholdPct,
        thresholdExceeded,
      };
    }),
  );
}

export type { CandleRow };
