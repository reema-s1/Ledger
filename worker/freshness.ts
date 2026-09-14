/**
 * Every quote carries a source and an as-of timestamp (see `candles.source`
 * / `candles.ts`, and ReconciledQuote.ts/source above them in the
 * pipeline). This is the pure check the read path (Section 6/7) will use
 * to decide whether to render a number as live or flag it stale — never
 * render a stale number as live.
 */

import { marketOpenMsBetween } from '../src/lib/time/market-calendar';

export type FreshnessState = 'live' | 'stale';

export function checkFreshness(asOf: Date, now: Date, staleThresholdMs: number): FreshnessState {
  return now.getTime() - asOf.getTime() > staleThresholdMs ? 'stale' : 'live';
}

/** Default: a quote older than 5 minutes during market hours is stale. */
export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export type FreshnessLevel = 'live' | 'stale' | 'unreachable';

/** A missed poll or two past a symbol's own cadence; not yet worth alarming over. */
export const STALE_MULTIPLIER = 3;
/** Far enough past cadence that a single slow tick can't explain it — the source has stopped answering. */
export const UNREACHABLE_MULTIPLIER = 20;

/**
 * checkFreshness against one flat threshold treats a cold-tier symbol
 * (polled every 5 min) as perpetually on the edge of "stale" while a
 * hot-tier symbol (polled every 5s) could go silent for 5 minutes -
 * 60x its own cadence - before anything flags it. This scales the
 * threshold to the symbol's own expected polling interval instead, and
 * adds a third state for "the source has been unreachable for a while,"
 * distinct from an ordinary between-polls gap.
 *
 * Age is measured in *open-market* time (marketOpenMsBetween), not wall
 * clock. Measuring wall clock meant every symbol tipped into
 * 'unreachable' over every weekend: Friday's close is three calendar
 * days old by Monday morning, which is hundreds of times any tier's
 * cadence, so the UI announced a data-provider outage every Saturday
 * about a feed that was working perfectly and a market that was shut.
 * Since a session's closing price genuinely *is* the most recent real
 * price until the next open, an overnight or weekend gap now costs
 * nothing, while silence during an actual session still escalates on
 * exactly the same multiples it did before.
 */
export function classifyFreshness(asOf: Date, now: Date, expectedIntervalMs: number): FreshnessLevel {
  const ageMs = marketOpenMsBetween(asOf, now);
  if (ageMs <= expectedIntervalMs * STALE_MULTIPLIER) return 'live';
  if (ageMs <= expectedIntervalMs * UNREACHABLE_MULTIPLIER) return 'stale';
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
