import { describe, it, expect } from 'vitest';
import { checkForResolution } from '../../worker/stale-alerts';

describe('checkForResolution', () => {
  it('resolves the brief\'s exact example: spiked 6%, gave it all back', () => {
    const original = { baselineClose: 100, triggerClose: 106 }; // +6% spike
    const check = checkForResolution('TCS', original, 100.2); // back near baseline
    expect(check.resolved).toBe(true);
    expect(check.retracedFraction).toBeGreaterThan(0.9);
    expect(check.explanation).toContain('spiked 6.0%');
    expect(check.explanation).toContain('gave back');
  });

  it('does not resolve while the move is still mostly in place', () => {
    const original = { baselineClose: 100, triggerClose: 106 };
    const check = checkForResolution('TCS', original, 105); // barely budged
    expect(check.resolved).toBe(false);
    expect(check.explanation).toBeNull();
  });

  it('does not resolve a move that got worse, not better', () => {
    const original = { baselineClose: 100, triggerClose: 106 };
    const check = checkForResolution('TCS', original, 110); // moved further away
    expect(check.resolved).toBe(false);
    expect(check.retracedFraction).toBeLessThan(0);
  });

  it('handles a downward move the same way, worded as "dropped"', () => {
    const original = { baselineClose: 100, triggerClose: 94 }; // -6% drop
    const check = checkForResolution('TCS', original, 99.9);
    expect(check.resolved).toBe(true);
    expect(check.explanation).toContain('dropped 6.0%');
  });

  it('respects a custom retrace threshold', () => {
    const original = { baselineClose: 100, triggerClose: 106 };
    // Retraced exactly 50% of the move.
    const halfway = 103;
    expect(checkForResolution('TCS', original, halfway, 0.75).resolved).toBe(false);
    expect(checkForResolution('TCS', original, halfway, 0.4).resolved).toBe(true);
  });
});
