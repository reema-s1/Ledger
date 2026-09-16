import { describe, it, expect } from 'vitest';
import {
  simulateMarketDay,
  simulateFeedDisagreement,
  simulateStaleness,
  simulateSplit,
  buildMarket,
  runPipeline,
  SIM_SYMBOL,
} from '../../src/simulate/scenarios';

describe('simulateMarketDay', () => {
  it('stays quiet when the whole market sells off, and offers reassurance instead', () => {
    const r = simulateMarketDay({ market: -0.035, sector: -0.035, stock: -0.035, volumeRatio: 1.5 });
    expect(r.outcome).toBe('evaluated');
    expect(r.event).toBeNull();
    expect(r.reassurance).not.toBeNull();
  });

  it('stays quiet in a sector-only selloff, without claiming the market explains it', () => {
    const r = simulateMarketDay({ market: 0, sector: -0.04, stock: -0.04, volumeRatio: 1.5 });
    expect(r.event).toBeNull();
    expect(r.reassurance).toBeNull();
  });

  it('flags a stock that falls on its own, on real volume', () => {
    const r = simulateMarketDay({ market: 0, sector: 0, stock: -0.04, volumeRatio: 2 });
    expect(r.event?.kind).toBe('residual_move');
    expect(r.event?.explanation).toMatch(/^Down 4\.0%/);
  });

  it('does not flag the same move on thin volume', () => {
    const r = simulateMarketDay({ market: 0, sector: 0, stock: -0.04, volumeRatio: 0.3 });
    expect(r.event).toBeNull();
    expect(r.decomposition!.volumeWeightedZ).toBe(0);
  });

  it('is deterministic', () => {
    const day = { market: 0.01, sector: 0.02, stock: 0.05, volumeRatio: 1.2 };
    expect(simulateMarketDay(day)).toEqual(simulateMarketDay(day));
  });
});

describe('runPipeline', () => {
  it('scores on the index calendar when the index skips a day, like live ingest', () => {
    const m = buildMarket({ market: 0, sector: 0, stock: -0.04, volumeRatio: 2 });
    const gappyIndex = m.index.filter((_, i) => i !== 40);
    const r = runPipeline({ symbol: SIM_SYMBOL, clusterLabel: 'IT', stock: m.stock, stockActions: [], secondaryClose: null, index: gappyIndex, peers: m.peers });
    expect(r.outcome).toBe('evaluated');
    expect(r.event).not.toBeNull();
  });
});

describe('simulateFeedDisagreement', () => {
  it('scores normally when feed B agrees within 1%', () => {
    const r = simulateFeedDisagreement(0.005);
    expect(r.result.outcome).toBe('evaluated');
    expect(r.result.reconciled.confirmed).toBe(true);
    expect(r.result.event).not.toBeNull();
  });

  it('refuses to score, and raises nothing, when feed B disagrees beyond 1%', () => {
    const r = simulateFeedDisagreement(0.03);
    expect(r.result.outcome).toBe('unconfirmed');
    expect(r.result.event).toBeNull();
    expect(r.result.reconciled.disagreementPct).toBeCloseTo(0.03, 6);
    expect(r.withoutConflict.event).not.toBeNull(); // the alert the gate held back
  });
});

describe('simulateStaleness', () => {
  it('walks fresh -> stale -> unavailable as sessions pass with no new price', () => {
    expect(simulateStaleness(0).quality).toBe('fresh');
    expect(simulateStaleness(1).quality).toBe('fresh');
    expect(simulateStaleness(2).quality).toBe('stale');
    expect(simulateStaleness(3).quality).toBe('stale');
    expect(simulateStaleness(4).quality).toBe('unavailable');
  });

  it('skips weekends when counting sessions', () => {
    // Wed 19 Aug + 3 sessions = Mon 24 Aug, not Sat 22 Aug.
    expect(simulateStaleness(3).now.toISOString().slice(0, 10)).toBe('2026-08-24');
  });
});

describe('simulateSplit', () => {
  it('records the split day as a corporate action instead of an 80% crash', () => {
    const r = simulateSplit('ex-date');
    expect(r.rawChange).toBeCloseTo(-0.8, 6);
    expect(r.withAdjustment.outcome).toBe('corporate-action');
    expect(r.withAdjustment.event).toBeNull();
    expect(r.withoutAdjustment.event).not.toBeNull();
    expect(r.withoutAdjustment.event!.decomposition.observedReturn).toBeCloseTo(-0.8, 6);
  });

  it('still catches a real move the day after, which an unadjusted history would miss', () => {
    const r = simulateSplit('next-session');
    expect(r.withAdjustment.event?.kind).toBe('residual_move');
    expect(r.withoutAdjustment.event).toBeNull();
  });
});
