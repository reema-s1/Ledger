import { describe, it, expect } from 'vitest';
import { checkFreshness, classifyFreshness } from '../../worker/freshness';

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
  const asOf = new Date('2026-08-19T10:00:00Z');
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
});
