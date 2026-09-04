import { describe, it, expect } from 'vitest';
import { compactEvents } from '../../src/digest/compact';
import type { DigestEvent } from '../../src/digest/types';

const NOW = new Date('2026-08-28T12:00:00Z');

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000);
}
function daysAgo(d: number): Date {
  return hoursAgo(d * 24);
}

function moveEvent(overrides: Partial<DigestEvent> & { id: number; symbol: string; ts: Date }): DigestEvent {
  return {
    kind: 'residual_move',
    payload: {},
    significance: 3,
    explanation: `${overrides.symbol} moved.`,
    ...overrides,
  };
}

describe('compactEvents — recent tier (< 1 day)', () => {
  it('keeps each event individual, full detail, newest first', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'TCS', ts: hoursAgo(10), explanation: 'TCS moved first.' }),
      moveEvent({ id: 2, symbol: 'INFY', ts: hoursAgo(2), explanation: 'INFY moved second.' }),
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.tier === 'recent')).toBe(true);
    expect(items[0]!.symbol).toBe('INFY'); // newest first
    expect(items[0]!.headline).toBe('INFY moved second.');
    expect(items[1]!.headline).toBe('TCS moved first.');
  });

  it('sits exactly at the 1-day boundary as episode, not recent (boundary is exclusive)', () => {
    const events: DigestEvent[] = [moveEvent({ id: 1, symbol: 'TCS', ts: daysAgo(1) })];
    const items = compactEvents(events, NOW);
    expect(items[0]!.tier).toBe('episode');
  });
});

describe('compactEvents — episode tier (1-7 days)', () => {
  it('merges a symbol\'s price-move events into one drift narrative', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'TCS', ts: daysAgo(5), payload: { baselineClose: 100, triggerClose: 98 } }),
      moveEvent({ id: 2, symbol: 'TCS', ts: daysAgo(3), payload: { baselineClose: 98, triggerClose: 96 } }),
      moveEvent({ id: 3, symbol: 'TCS', ts: daysAgo(2), payload: { baselineClose: 96, triggerClose: 94 } }),
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.tier).toBe('episode');
    expect(items[0]!.symbol).toBe('TCS');
    expect(items[0]!.headline).toBe('TCS drifted down 6.0% over 3 sessions.');
    expect(items[0]!.eventIds.sort()).toEqual([1, 2, 3]);
  });

  it('keeps different symbols as separate episode items', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'TCS', ts: daysAgo(3), payload: { baselineClose: 100, triggerClose: 103 } }),
      moveEvent({ id: 2, symbol: 'INFY', ts: daysAgo(4), payload: { baselineClose: 50, triggerClose: 49 } }),
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.symbol))).toEqual(new Set(['TCS', 'INFY']));
  });

  it('falls back to a count-only headline when price payload is missing', () => {
    const events: DigestEvent[] = [moveEvent({ id: 1, symbol: 'TCS', ts: daysAgo(3), payload: {} })];
    const items = compactEvents(events, NOW);
    expect(items[0]!.headline).toBe('TCS: 1 move flagged.');
  });
});

describe('compactEvents — chapter tier (> 7 days)', () => {
  it('collapses many events for a symbol into exactly one line with net change', () => {
    // Listed oldest-first (chronological) with a genuine down-drift; the
    // implementation sorts by ts internally regardless of input order.
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'TCS', ts: daysAgo(30), payload: { baselineClose: 100, triggerClose: 97 } }),
      moveEvent({ id: 2, symbol: 'TCS', ts: daysAgo(20), payload: { baselineClose: 97, triggerClose: 94 } }),
      moveEvent({ id: 3, symbol: 'TCS', ts: daysAgo(10), payload: { baselineClose: 94, triggerClose: 90 } }),
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.tier).toBe('chapter');
    expect(items[0]!.headline).toMatch(/^TCS: 3 moves flagged, net down \d+\.\d%/);
  });

  it('collapses four months / thousands of events for a symbol into one readable line — the core requirement', () => {
    const events: DigestEvent[] = [];
    let price = 100;
    for (let i = 0; i < 4000; i++) {
      const next = price * (1 + (i % 2 === 0 ? 0.001 : -0.0009));
      events.push(
        moveEvent({
          id: i + 1,
          symbol: 'TCS',
          ts: daysAgo(120 + i / 30), // spread across ~4 months, well past the chapter cutoff
          payload: { baselineClose: price, triggerClose: next },
        }),
      );
      price = next;
    }
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.tier).toBe('chapter');
    expect(items[0]!.headline).toContain('4000 moves flagged');
  });

  it('reports different symbols as separate chapter lines, each still collapsed to one', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'TCS', ts: daysAgo(10), payload: { baselineClose: 100, triggerClose: 101 } }),
      moveEvent({ id: 2, symbol: 'TCS', ts: daysAgo(15), payload: { baselineClose: 99, triggerClose: 100 } }),
      moveEvent({ id: 3, symbol: 'INFY', ts: daysAgo(12), payload: { baselineClose: 50, triggerClose: 51 } }),
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(2);
  });
});

describe('compactEvents — resolved moves fold into one item, not two', () => {
  it('shows the resolution\'s explanation instead of the original alert, and does not list the resolution as a separate item', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'WIPRO', ts: hoursAgo(20), explanation: 'WIPRO spiked 6%.', payload: { baselineClose: 100, triggerClose: 106 } }),
      {
        id: 2,
        symbol: 'WIPRO',
        ts: hoursAgo(18),
        kind: 'event_resolved',
        payload: { originalEventId: 1, retracedFraction: 1 },
        significance: null,
        explanation: 'WIPRO spiked 6.0%, gave back all of it since.',
      },
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.headline).toBe('WIPRO spiked 6.0%, gave back all of it since.');
    expect(items[0]!.eventIds.sort()).toEqual([1, 2]);
  });

  it('applies the same folding across tier boundaries (original recent, resolution still recent)', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'WIPRO', ts: daysAgo(3), explanation: 'original' }),
      {
        id: 2,
        symbol: 'WIPRO',
        ts: daysAgo(3),
        kind: 'event_resolved',
        payload: { originalEventId: 1 },
        significance: null,
        explanation: 'resolved outcome',
      },
    ];
    const items = compactEvents(events, NOW);
    // Folded before bucketing, so it's one episode-tier item using the resolved text.
    expect(items).toHaveLength(1);
    expect(items[0]!.tier).toBe('episode');
  });
});

describe('compactEvents — corporate actions never merge into a price-move narrative', () => {
  it('renders a corporate action as its own item even alongside price moves in the same tier', () => {
    const events: DigestEvent[] = [
      moveEvent({ id: 1, symbol: 'BAJFINANCE', ts: daysAgo(3), payload: { baselineClose: 100, triggerClose: 99 } }),
      {
        id: 2,
        symbol: 'BAJFINANCE',
        ts: daysAgo(2),
        kind: 'corporate_action',
        payload: { type: 'split', ratio: 5 },
        significance: null,
        explanation: 'BAJFINANCE executed a 1:5 split today.',
      },
    ];
    const items = compactEvents(events, NOW);
    expect(items).toHaveLength(2);
    const ca = items.find((i) => i.headline.includes('split'));
    expect(ca).toBeDefined();
    expect(ca!.eventIds).toEqual([2]);
  });
});

describe('compactEvents — empty input', () => {
  it('returns no items', () => {
    expect(compactEvents([], NOW)).toEqual([]);
  });
});
