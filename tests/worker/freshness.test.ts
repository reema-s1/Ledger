import { describe, it, expect } from 'vitest';
import { checkFreshness, classifyFreshness, classifyQuoteQuality } from '../../worker/freshness';

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

describe('classifyFreshness', () => {
  // Daily bars are stamped at the 09:15 IST open (03:45Z), as Yahoo does.
  const wedBar = new Date('2026-08-19T03:45:00Z'); // Wed 19 Aug session

  // The bug this replaced: thresholds were the live worker's polling
  // cadence, measured from the open stamp, so a bar ingested that evening
  // already read "unreachable" and the whole watchlist glowed red.
  it("is live the evening its session's bar is ingested", () => {
    expect(classifyFreshness(wedBar, new Date('2026-08-19T11:30:00Z'))).toBe('live'); // Wed 17:00 IST
  });

  it('is live during its own session, before the close', () => {
    expect(classifyFreshness(wedBar, new Date('2026-08-19T06:30:00Z'))).toBe('live');
  });

  it("stays live through the next session, whose bar can't exist until it closes", () => {
    expect(classifyFreshness(wedBar, new Date('2026-08-20T06:30:00Z'))).toBe('live'); // Thu 12:00 IST
    expect(classifyFreshness(wedBar, new Date('2026-08-20T11:30:00Z'))).toBe('live'); // Thu 17:00 IST, pre-ingest
  });

  it('turns stale once a further full session closes without a newer bar', () => {
    expect(classifyFreshness(wedBar, new Date('2026-08-21T11:30:00Z'))).toBe('stale'); // Fri evening
  });

  it('turns unreachable after several missed sessions', () => {
    expect(classifyFreshness(wedBar, new Date('2026-08-26T11:30:00Z'))).toBe('unreachable'); // next Wed
  });

  it('does not age a Friday bar over the weekend', () => {
    const fridayBar = new Date('2026-09-11T03:45:00Z');
    expect(classifyFreshness(fridayBar, new Date('2026-09-13T06:30:00Z'))).toBe('live'); // Sunday
    expect(classifyFreshness(fridayBar, new Date('2026-09-14T06:30:00Z'))).toBe('live'); // Monday mid-session
  });
});

describe('classifyQuoteQuality', () => {
  it('is fresh when live and confirmed', () => {
    expect(classifyQuoteQuality('live', true)).toBe('fresh');
  });

  it('is stale when the freshness level is stale and confirmed', () => {
    expect(classifyQuoteQuality('stale', true)).toBe('stale');
  });

  it('is unavailable when the source has gone unreachable', () => {
    expect(classifyQuoteQuality('unreachable', true)).toBe('unavailable');
  });

  it('is invalid when unconfirmed, even if the print is otherwise live', () => {
    expect(classifyQuoteQuality('live', false)).toBe('invalid');
  });

  it('prioritizes invalid over unavailable — a bad print is a bad print regardless of age', () => {
    expect(classifyQuoteQuality('unreachable', false)).toBe('invalid');
  });
});
