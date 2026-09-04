/**
 * Every quote carries a source and an as-of timestamp (see `candles.source`
 * / `candles.ts`, and ReconciledQuote.ts/source above them in the
 * pipeline). This is the pure check the read path (Section 6/7) will use
 * to decide whether to render a number as live or flag it stale — never
 * render a stale number as live.
 */

export type FreshnessState = 'live' | 'stale';

export function checkFreshness(asOf: Date, now: Date, staleThresholdMs: number): FreshnessState {
  return now.getTime() - asOf.getTime() > staleThresholdMs ? 'stale' : 'live';
}

/** Default: a quote older than 5 minutes during market hours is stale. */
export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;
