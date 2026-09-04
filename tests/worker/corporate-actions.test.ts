import { describe, it, expect } from 'vitest';
import { adjustBarsForCorporateActions, isExDate } from '../../worker/corporate-actions';

describe('adjustBarsForCorporateActions', () => {
  it('removes the ~-80% overnight discontinuity a 1:5 split reads as, unadjusted', () => {
    // Raw as-traded prices: steady ~1000 pre-split, then the exchange
    // print drops to ~200 on the ex-date because there are now 5x the
    // shares — exactly the "-80% to a naive diff" case from the brief.
    const bars = [
      { sessionDate: '2026-08-17', close: 995, volume: 1_000_000 },
      { sessionDate: '2026-08-18', close: 1005, volume: 1_000_000 },
      { sessionDate: '2026-08-19', close: 1000, volume: 1_000_000 }, // last pre-split day
      { sessionDate: '2026-08-20', close: 202, volume: 5_000_000 }, // ex-date: post-split scale
      { sessionDate: '2026-08-21', close: 204, volume: 5_000_000 },
    ];
    const actions = [{ exDate: '2026-08-20', type: 'split' as const, ratio: 5 }];

    const adjusted = adjustBarsForCorporateActions(bars, actions);

    // Pre-split closes are rescaled down by the ratio...
    expect(adjusted[0]!.close).toBeCloseTo(995 / 5, 5);
    expect(adjusted[2]!.close).toBeCloseTo(1000 / 5, 5);
    // ...and pre-split volume scaled up, so the series reads continuously.
    expect(adjusted[2]!.volume).toBeCloseTo(5_000_000, 5);
    // Post-split bars are untouched.
    expect(adjusted[3]!.close).toBe(202);
    expect(adjusted[4]!.close).toBe(204);

    // The naive diff across the ex-date would be ~-80%; the adjusted diff
    // between the last pre-split close and the ex-date close is small.
    const naiveDiff = (bars[3]!.close - bars[2]!.close) / bars[2]!.close;
    const adjustedDiff = (adjusted[3]!.close - adjusted[2]!.close) / adjusted[2]!.close;
    expect(naiveDiff).toBeLessThan(-0.7);
    expect(Math.abs(adjustedDiff)).toBeLessThan(0.05);
  });

  it('is a no-op when there are no corporate actions', () => {
    const bars = [
      { sessionDate: '2026-08-17', close: 100, volume: 1000 },
      { sessionDate: '2026-08-18', close: 101, volume: 1100 },
    ];
    expect(adjustBarsForCorporateActions(bars, [])).toEqual(bars);
  });

  it('ignores dividends (no price/volume rescaling)', () => {
    const bars = [{ sessionDate: '2026-08-17', close: 100, volume: 1000 }];
    const actions = [{ exDate: '2026-08-18', type: 'dividend' as const, ratio: 1 }];
    expect(adjustBarsForCorporateActions(bars, actions)).toEqual(bars);
  });

  it('compounds two splits correctly for bars before both ex-dates', () => {
    const bars = [{ sessionDate: '2026-01-01', close: 1000, volume: 100 }];
    const actions = [
      { exDate: '2026-06-01', type: 'split' as const, ratio: 2 },
      { exDate: '2027-01-01', type: 'split' as const, ratio: 5 },
    ];
    const adjusted = adjustBarsForCorporateActions(bars, actions);
    expect(adjusted[0]!.close).toBeCloseTo(1000 / (2 * 5), 5);
    expect(adjusted[0]!.volume).toBeCloseTo(100 * 2 * 5, 5);
  });
});

describe('isExDate', () => {
  it('finds the action matching the exact session date', () => {
    const actions = [{ exDate: '2026-08-20', type: 'split' as const, ratio: 5 }];
    expect(isExDate('2026-08-20', actions)).toEqual(actions[0]);
    expect(isExDate('2026-08-19', actions)).toBeNull();
  });
});
