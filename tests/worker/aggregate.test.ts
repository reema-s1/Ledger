import { describe, it, expect } from 'vitest';
import { alignBars, computeClusterMeanReturns } from '../../worker/aggregate';
import type { RawBar } from '../../worker/corporate-actions';

describe('alignBars', () => {
  it('re-indexes onto the reference series when dates match exactly', () => {
    const reference: RawBar[] = [
      { sessionDate: '2026-08-17', close: 100, volume: 10 },
      { sessionDate: '2026-08-18', close: 101, volume: 11 },
    ];
    const other: RawBar[] = [
      { sessionDate: '2026-08-17', close: 200, volume: 20 },
      { sessionDate: '2026-08-18', close: 202, volume: 22 },
    ];
    const aligned = alignBars(reference, other);
    expect(aligned).toEqual([
      { sessionDate: '2026-08-17', close: 200, volume: 20 },
      { sessionDate: '2026-08-18', close: 202, volume: 22 },
    ]);
  });

  it('returns null when the other series is missing a date the reference has', () => {
    const reference: RawBar[] = [
      { sessionDate: '2026-08-17', close: 100, volume: 10 },
      { sessionDate: '2026-08-18', close: 101, volume: 11 },
    ];
    const other: RawBar[] = [{ sessionDate: '2026-08-17', close: 200, volume: 20 }];
    expect(alignBars(reference, other)).toBeNull();
  });
});

describe('computeClusterMeanReturns', () => {
  it('averages daily returns across peers, day-aligned to the symbol', () => {
    const symbolBars = [
      { sessionDate: '2026-08-17', close: 100, volume: 1 },
      { sessionDate: '2026-08-18', close: 101, volume: 1 },
      { sessionDate: '2026-08-19', close: 102, volume: 1 },
    ];
    const peerA = [
      { sessionDate: '2026-08-17', close: 50, volume: 1 },
      { sessionDate: '2026-08-18', close: 51, volume: 1 }, // +2%
      { sessionDate: '2026-08-19', close: 51 }, // -0% intentionally missing volume, unused
    ].map((b) => ({ ...b, volume: b.volume ?? 1 }));
    const peerB = [
      { sessionDate: '2026-08-17', close: 200, volume: 1 },
      { sessionDate: '2026-08-18', close: 196, volume: 1 }, // -2%
      { sessionDate: '2026-08-19', close: 196, volume: 1 }, // 0%
    ];

    const returns = computeClusterMeanReturns(symbolBars, [peerA, peerB]);
    expect(returns).toHaveLength(2);
    // Day 1: peerA +2%, peerB -2% -> mean 0%.
    expect(returns[0]).toBeCloseTo(0, 5);
    // Day 2: peerA 51->51 = 0%, peerB 196->196 = 0% -> mean 0%.
    expect(returns[1]).toBeCloseTo(0, 5);
  });

  it('returns an empty array when there are no peers', () => {
    const symbolBars = [
      { sessionDate: '2026-08-17', close: 100, volume: 1 },
      { sessionDate: '2026-08-18', close: 101, volume: 1 },
    ];
    expect(computeClusterMeanReturns(symbolBars, [])).toEqual([]);
  });
});
