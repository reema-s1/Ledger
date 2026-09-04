import { describe, it, expect } from 'vitest';
import { reconcileQuotes, type SourceQuote } from '../../worker/reconcile';

const ts = new Date('2026-08-19T10:00:00Z');

describe('reconcileQuotes', () => {
  it('confirms when two sources agree within tolerance', () => {
    const primary: SourceQuote = { price: 100, ts, source: 'primary' };
    const secondary: SourceQuote = { price: 100.3, ts, source: 'secondary' }; // 0.3% apart
    const result = reconcileQuotes(primary, secondary, 0.01);
    expect(result.confirmed).toBe(true);
    expect(result.disagreementPct).toBeCloseTo(0.003, 3);
  });

  it('marks unconfirmed — never silently picks one — when sources disagree beyond tolerance', () => {
    const primary: SourceQuote = { price: 100, ts, source: 'primary' };
    const secondary: SourceQuote = { price: 105, ts, source: 'secondary' }; // 5% apart
    const result = reconcileQuotes(primary, secondary, 0.01);
    expect(result.confirmed).toBe(false);
    expect(result.disagreementPct).toBeCloseTo(0.05, 3);
    // The disagreement is surfaced, not hidden: both readings are still there.
    expect(result.primary.price).toBe(100);
    expect(result.secondary?.price).toBe(105);
  });

  it('treats a missing secondary as confirmed but explicitly flags no cross-check happened', () => {
    const primary: SourceQuote = { price: 100, ts, source: 'primary' };
    const result = reconcileQuotes(primary, null, 0.01);
    expect(result.confirmed).toBe(true);
    expect(result.secondary).toBeNull();
    expect(result.disagreementPct).toBeNull();
  });

  it('sits exactly at the tolerance boundary as confirmed (inclusive)', () => {
    const primary: SourceQuote = { price: 100, ts, source: 'primary' };
    const secondary: SourceQuote = { price: 101, ts, source: 'secondary' }; // exactly 1%
    const result = reconcileQuotes(primary, secondary, 0.01);
    expect(result.confirmed).toBe(true);
  });
});
