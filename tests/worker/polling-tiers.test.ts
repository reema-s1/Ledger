import { describe, it, expect } from 'vitest';
import { pollingTierFor, DEFAULT_TIER_THRESHOLDS } from '../../worker/polling-tiers';

describe('pollingTierFor', () => {
  it('assigns cold to a symbol nobody watches', () => {
    expect(pollingTierFor(0).tier).toBe('cold');
  });

  it('assigns warm once at least one watcher exists', () => {
    expect(pollingTierFor(1).tier).toBe('warm');
  });

  it('assigns hot past the hot threshold', () => {
    expect(pollingTierFor(DEFAULT_TIER_THRESHOLDS.hotMinWatchers).tier).toBe('hot');
  });

  it('hot polls strictly more often than warm, which polls strictly more often than cold', () => {
    const hot = pollingTierFor(50);
    const warm = pollingTierFor(3);
    const cold = pollingTierFor(0);
    expect(hot.intervalMs).toBeLessThan(warm.intervalMs);
    expect(warm.intervalMs).toBeLessThan(cold.intervalMs);
  });
});
