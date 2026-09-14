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
  // Mid-session deliberately: 05:30Z is 11:00 IST on a Wednesday, leaving
  // 4h30m of open market ahead of it. These cases are about how silence
  // *during* a session escalates, so they need real open time to elapse —
  // an asOf pinned to the 15:30 IST close would make every gap below
  // measure zero open minutes and stay 'live' forever.
  const asOf = new Date('2026-08-19T05:30:00Z');
  const minutes = (n: number) => new Date(asOf.getTime() + n * 60 * 1000);

  it('is live within a few missed polls of a hot-tier (5s) symbol', () => {
    const now = new Date(asOf.getTime() + 10 * 1000); // 2 missed 5s polls
    expect(classifyFreshness(asOf, now, 5_000)).toBe('live');
  });

  it('flags a hot-tier symbol unreachable after real silence, not one slow tick', () => {
    const now = new Date(asOf.getTime() + 110 * 1000); // 22x its 5s cadence
    expect(classifyFreshness(asOf, now, 5_000)).toBe('unreachable');
  });

  it('treats the same absolute gap as routine for a cold-tier (5min) symbol', () => {
    // 12 minutes silent is alarming for a hot symbol but unremarkable for cold
    expect(classifyFreshness(asOf, minutes(12), 5 * 60 * 1000)).toBe('live');
  });

  it('still eventually flags a cold-tier symbol unreachable given enough silence', () => {
    expect(classifyFreshness(asOf, minutes(120), 5 * 60 * 1000)).toBe('unreachable');
  });

  it('sits in stale between the live and unreachable bands', () => {
    expect(classifyFreshness(asOf, minutes(20), 5 * 60 * 1000)).toBe('stale');
  });

  // The bug this replaced: age was wall-clock, so a Friday close was
  // "three days silent" by Sunday — hundreds of times any tier's cadence
  // — and every symbol announced a provider outage every single weekend,
  // about a feed that was fine and a market that was shut.
  it('does not age a Friday close over the weekend, when no session has happened', () => {
    const fridayClose = new Date('2026-09-11T10:00:00Z'); // Fri 15:30 IST
    const saturday = new Date('2026-09-12T06:30:00Z');
    const sunday = new Date('2026-09-13T06:30:00Z');
    expect(classifyFreshness(fridayClose, saturday, 5 * 60 * 1000)).toBe('live');
    expect(classifyFreshness(fridayClose, sunday, 5 * 60 * 1000)).toBe('live');
  });

  it('does not age a close overnight either, before the next session opens', () => {
    const wedClose = new Date('2026-08-19T10:00:00Z'); // Wed 15:30 IST
    const thursPreOpen = new Date('2026-08-20T03:00:00Z'); // Thu 08:30 IST, pre-market
    expect(classifyFreshness(wedClose, thursPreOpen, 5 * 60 * 1000)).toBe('live');
  });

  it('resumes ageing once the next session actually opens', () => {
    // Same Wednesday close, but now well into Thursday's session — the
    // market has been open for hours with no new print, which is a real
    // gap rather than an overnight one.
    const wedClose = new Date('2026-08-19T10:00:00Z');
    const thursMidSession = new Date('2026-08-20T06:30:00Z'); // Thu 12:00 IST
    expect(classifyFreshness(wedClose, thursMidSession, 5 * 60 * 1000)).toBe('unreachable');
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
