/**
 * Frequency by watchlist membership: symbols a lot of people are watching
 * get polled often, symbols nobody's watching get polled rarely. Pure
 * function of a count so it's trivially testable; the caller (loop.ts)
 * supplies the real counts from db/queries/watchlist.ts.
 */

export type PollingTier = 'hot' | 'warm' | 'cold';

export interface TierAssignment {
  tier: PollingTier;
  intervalMs: number;
}

export interface TierThresholds {
  /** >= this many watchers -> hot. */
  hotMinWatchers: number;
  /** >= this many watchers (but below hot) -> warm; below this -> cold. */
  warmMinWatchers: number;
  hotIntervalMs: number;
  warmIntervalMs: number;
  coldIntervalMs: number;
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  hotMinWatchers: 10,
  warmMinWatchers: 1,
  hotIntervalMs: 5_000,
  warmIntervalMs: 30_000,
  coldIntervalMs: 5 * 60_000,
};

export function pollingTierFor(
  watcherCount: number,
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): TierAssignment {
  if (watcherCount >= thresholds.hotMinWatchers) return { tier: 'hot', intervalMs: thresholds.hotIntervalMs };
  if (watcherCount >= thresholds.warmMinWatchers) return { tier: 'warm', intervalMs: thresholds.warmIntervalMs };
  return { tier: 'cold', intervalMs: thresholds.coldIntervalMs };
}
