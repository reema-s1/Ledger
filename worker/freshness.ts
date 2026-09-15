/**
 * Every quote carries a source and an as-of timestamp (see `candles.source`
 * / `candles.ts`, and ReconciledQuote.ts/source above them in the
 * pipeline). This is the pure check the read path (Section 6/7) will use
 * to decide whether to render a number as live or flag it stale — never
 * render a stale number as live.
 */

import {
  istDateString,
  marketOpenMsBetween,
  sessionCloseTs,
  MARKET_CLOSE_MINUTES_OF_DAY,
  MARKET_OPEN_MINUTES_OF_DAY,
} from '../src/lib/time/market-calendar';

export type FreshnessState = 'live' | 'stale';

export function checkFreshness(asOf: Date, now: Date, staleThresholdMs: number): FreshnessState {
  return now.getTime() - asOf.getTime() > staleThresholdMs ? 'stale' : 'live';
}

/** Default: a quote older than 5 minutes during market hours is stale. */
export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export type FreshnessLevel = 'live' | 'stale' | 'unreachable';

/** One NSE session, 09:15-15:30 IST, as milliseconds of open market. */
export const SESSION_MS = (MARKET_CLOSE_MINUTES_OF_DAY - MARKET_OPEN_MINUTES_OF_DAY) * 60_000;

/** Up to this many further sessions without a newer candle reads 'stale' rather than 'unreachable'. */
const STALE_SESSIONS = 3;

/**
 * Open-market time elapsed since a daily candle's session *closed*.
 *
 * Every candle is one daily bar, and a bar covers its session through
 * the close — but Yahoo stamps it at the 09:15 IST open. Measuring from
 * that stamp counted the whole trading day the bar already describes as
 * silence, so a candle ingested at 17:00 read "6h of open market with no
 * new price" the moment it arrived.
 */
export function marketMsSinceSessionClose(asOf: Date, now: Date): number {
  const close = sessionCloseTs(istDateString(asOf));
  return close.getTime() >= now.getTime() ? 0 : marketOpenMsBetween(close, now);
}

/**
 * How current a daily candle is, measured in trading sessions.
 *
 * 'live' while it's the newest bar that could exist yet: the next
 * session's bar can't be ingested until that session has closed, so up
 * to one further full session of open market is simply "not yet", not
 * "missing". 'stale' once a whole further session has passed without a
 * newer bar (a missed daily run), 'unreachable' after several.
 *
 * This replaced thresholds scaled to the worker's 5s/30s/5min polling
 * tiers. Those were built for continuous polling; with data arriving
 * once a day they flagged every symbol unreachable about 100 minutes into
 * each morning's session and kept it red until the evening run. Weekends
 * and nights cost nothing either way, since only open-market time counts.
 */
export function classifyFreshness(asOf: Date, now: Date): FreshnessLevel {
  const ageMs = marketMsSinceSessionClose(asOf, now);
  if (ageMs <= SESSION_MS) return 'live';
  if (ageMs <= SESSION_MS * STALE_SESSIONS) return 'stale';
  return 'unreachable';
}

/**
 * A quote's trust state, per the brief's four-state model: 'fresh' (live,
 * confirmed), 'stale' (older than expected but the last confirmed print),
 * 'unavailable' (the source has gone quiet — Section 5's `unreachable`),
 * or 'invalid' (the two-source reconciliation gate rejected it —
 * `confirmed: false` on the candle, see reconcile.ts). This combines two
 * already-computed, independent facts (how old is this print, did the
 * reconciliation gate accept it) into one classification for display —
 * it doesn't change what either fact means or how either is computed.
 *
 * 'invalid' takes priority over the freshness level: a print two sources
 * disagreed on is untrustworthy regardless of how recent it is — a fresh
 * but invalid quote is not "fresher" than a stale one, it's a bad number
 * that just happens to be new. Stale/unavailable/invalid quotes must
 * never be treated as grounds for a new cursor advance or a new
 * significance event — already true structurally (worker/ingest.ts skips
 * significance evaluation whenever `confirmed` is false, and cursors only
 * ever move on an explicit client ack, never from data freshness).
 */
export type QuoteQuality = 'fresh' | 'stale' | 'unavailable' | 'invalid';

export function classifyQuoteQuality(freshness: FreshnessLevel, confirmed: boolean): QuoteQuality {
  if (!confirmed) return 'invalid';
  if (freshness === 'unreachable') return 'unavailable';
  if (freshness === 'stale') return 'stale';
  return 'fresh';
}
