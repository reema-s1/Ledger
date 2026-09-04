import { describe, it, expect } from 'vitest';
import { buildReassuranceCards } from '../../src/digest/reassurance-cards';
import type { DigestEvent } from '../../src/digest/types';

const NOW = new Date('2026-08-28T12:00:00Z');
function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000);
}

function reassuranceEvent(id: number, symbol: string, ts: Date, observedReturn: number): DigestEvent {
  return {
    id,
    symbol,
    ts,
    kind: 'reassurance',
    payload: { observedReturn },
    significance: null,
    explanation: `${symbol} is down ${Math.abs(observedReturn * 100).toFixed(1)}%. So is the market.`,
  };
}

describe('buildReassuranceCards', () => {
  it('includes a reassurance event from today', () => {
    const cards = buildReassuranceCards([reassuranceEvent(1, 'TCS', hoursAgo(2), -0.04)], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.symbol).toBe('TCS');
  });

  it('excludes a reassurance event older than 1 day (the explanation says "today")', () => {
    const cards = buildReassuranceCards([reassuranceEvent(1, 'TCS', hoursAgo(30), -0.04)], NOW);
    expect(cards).toHaveLength(0);
  });

  it('ignores non-reassurance events entirely', () => {
    const events: DigestEvent[] = [
      { id: 1, symbol: 'TCS', ts: hoursAgo(2), kind: 'residual_move', payload: {}, significance: 3, explanation: 'x' },
    ];
    expect(buildReassuranceCards(events, NOW)).toHaveLength(0);
  });

  it('caps at 3, sorted by magnitude descending', () => {
    const events = [
      reassuranceEvent(1, 'A', hoursAgo(1), -0.031),
      reassuranceEvent(2, 'B', hoursAgo(1), -0.05),
      reassuranceEvent(3, 'C', hoursAgo(1), -0.038),
      reassuranceEvent(4, 'D', hoursAgo(1), -0.045),
      reassuranceEvent(5, 'E', hoursAgo(1), 0.033),
    ];
    const cards = buildReassuranceCards(events, NOW);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.symbol)).toEqual(['B', 'D', 'C']);
  });
});
