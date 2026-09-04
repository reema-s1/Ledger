import { describe, it, expect } from 'vitest';
import { attachResolutionNotes } from '../../src/digest/resolution-notes';
import type { DigestEvent, DigestItem } from '../../src/digest/types';

const NOW = new Date('2026-08-28T12:00:00Z');

function resolutionEvent(id: number, symbol: string, originalEventId: number, explanation: string): DigestEvent {
  return {
    id,
    symbol,
    ts: NOW,
    kind: 'resolution',
    payload: { originalEventId, outcome: 'held' },
    significance: null,
    explanation,
  };
}

function chapterItem(overrides: Partial<DigestItem>): DigestItem {
  return {
    tier: 'chapter',
    kind: 'residual_move',
    symbol: 'WIPRO',
    headline: 'WIPRO: 3 moves flagged, net down 3.2% since 2026-08-13.',
    eventIds: [10],
    fromTs: '2026-08-13T10:00:00.000Z',
    toTs: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('attachResolutionNotes', () => {
  it('is a no-op when there are no resolution events', () => {
    const items = [chapterItem({})];
    expect(attachResolutionNotes(items, [], NOW)).toEqual(items);
  });

  it('appends the resolution clause to the matching item and folds its id in', () => {
    const items = [chapterItem({ eventIds: [10] })];
    const resolutions = [resolutionEvent(99, 'WIPRO', 10, 'Flagged for structural break — still diverged, down 6.0% since.')];

    const result = attachResolutionNotes(items, resolutions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]!.headline).toContain('days ago for structural break');
    expect(result[0]!.headline).toContain('still diverged, down 6.0% since');
    expect(result[0]!.eventIds).toContain(99);
  });

  it('never attaches to a "recent" tier item', () => {
    const items = [chapterItem({ tier: 'recent', eventIds: [10] })];
    const resolutions = [resolutionEvent(99, 'WIPRO', 10, 'Flagged for unusual move — fully reverted since.')];
    const result = attachResolutionNotes(items, resolutions, NOW);
    expect(result[0]!.headline).toBe(items[0]!.headline);
  });

  it('creates a standalone ackable item when the original event is not in the current fetch (already read earlier)', () => {
    const resolutions = [resolutionEvent(99, 'WIPRO', 10, 'Flagged for unusual move — fully reverted since.')];
    const result = attachResolutionNotes([], resolutions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventIds).toEqual([99]);
    expect(result[0]!.symbol).toBe('WIPRO');
    expect(result[0]!.headline).toContain('Flagged earlier for');
  });

  it('does not duplicate a resolution across both an attached clause and an orphaned item', () => {
    const items = [chapterItem({ eventIds: [10] })];
    const resolutions = [resolutionEvent(99, 'WIPRO', 10, 'Flagged for structural break — still diverged, down 6.0% since.')];
    const result = attachResolutionNotes(items, resolutions, NOW);
    expect(result).toHaveLength(1); // not 2
  });
});
