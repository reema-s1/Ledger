import { describe, it, expect } from 'vitest';
import { checkFreshness } from '../../worker/freshness';

describe('checkFreshness', () => {
  it('is live just under the threshold', () => {
    const asOf = new Date('2026-08-19T10:00:00Z');
    const now = new Date(asOf.getTime() + 4 * 60 * 1000);
    expect(checkFreshness(asOf, now, 5 * 60 * 1000)).toBe('live');
  });

  it('is stale just over the threshold', () => {
    const asOf = new Date('2026-08-19T10:00:00Z');
    const now = new Date(asOf.getTime() + 6 * 60 * 1000);
    expect(checkFreshness(asOf, now, 5 * 60 * 1000)).toBe('stale');
  });

  it('never reports a future-dated quote as stale', () => {
    const asOf = new Date('2026-08-19T10:00:00Z');
    expect(checkFreshness(asOf, asOf, 5 * 60 * 1000)).toBe('live');
  });
});
