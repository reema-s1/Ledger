import { describe, it, expect } from 'vitest';
import { parseQuestion, composeAnswer, type AskLogEvent, type SymbolIndexEntry } from '../../src/lib/ask-log';

const SYMBOL_INDEX: SymbolIndexEntry[] = [
  { symbol: 'WIPRO', name: 'Wipro Limited' },
  { symbol: 'TCS', name: 'Tata Consultancy Services' },
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
];

function event(overrides: Partial<AskLogEvent>): AskLogEvent {
  return {
    id: 1,
    symbol: 'WIPRO',
    kind: 'residual_move',
    ts: '2026-08-01T10:00:00.000Z',
    explanation: 'WIPRO moved.',
    significance: 2.5,
    ...overrides,
  };
}

describe('parseQuestion', () => {
  it('matches a symbol by its ticker', () => {
    expect(parseQuestion('why is WIPRO down', SYMBOL_INDEX).symbol).toBe('WIPRO');
  });

  it('matches a symbol by a distinctive word in its company name', () => {
    expect(parseQuestion('what happened to Reliance last month', SYMBOL_INDEX).symbol).toBe('RELIANCE');
  });

  it('returns null when no symbol is mentioned', () => {
    expect(parseQuestion('why is my portfolio red today', SYMBOL_INDEX).symbol).toBeNull();
  });

  it('defaults sinceDays to 1', () => {
    expect(parseQuestion('why is WIPRO down', SYMBOL_INDEX).sinceDays).toBe(1);
  });

  it('widens to 7 days on "last week"', () => {
    expect(parseQuestion('what happened last week', SYMBOL_INDEX).sinceDays).toBe(7);
  });

  it('widens to 30 days on "last month"', () => {
    expect(parseQuestion('what happened to TCS last month', SYMBOL_INDEX).sinceDays).toBe(30);
  });

  it('widens to 2 days on "yesterday"', () => {
    expect(parseQuestion('what happened yesterday', SYMBOL_INDEX).sinceDays).toBe(2);
  });

  it('detects why_red intent from "red"/"down"/"drop" language', () => {
    expect(parseQuestion('why is my portfolio red today', SYMBOL_INDEX).kind).toBe('why_red');
    expect(parseQuestion('why did WIPRO drop', SYMBOL_INDEX).kind).toBe('why_red');
  });

  it('detects what_happened intent', () => {
    expect(parseQuestion('what happened to WIPRO last month', SYMBOL_INDEX).kind).toBe('what_happened');
  });

  it('falls back to general intent for unrelated questions, never errors', () => {
    expect(parseQuestion('tell me something', SYMBOL_INDEX).kind).toBe('general');
  });
});

describe('composeAnswer', () => {
  it('reports nothing flagged for a named symbol with no events', () => {
    const result = composeAnswer({ symbol: 'WIPRO', sinceDays: 1, kind: 'general' }, []);
    expect(result.answer).toBe('Nothing flagged for WIPRO in that window.');
    expect(result.events).toEqual([]);
  });

  it('reports nothing cleared the bar for the whole watchlist with no events', () => {
    const result = composeAnswer({ symbol: null, sinceDays: 1, kind: 'general' }, []);
    expect(result.answer).toBe('Nothing on your watchlist cleared the significance bar in that window.');
  });

  it('surfaces the reassurance explanation for a why_red whole-watchlist question with only reassurance events', () => {
    const events = [event({ kind: 'reassurance', explanation: 'The market was down 2% today — nothing specific to WIPRO.' })];
    const result = composeAnswer({ symbol: null, sinceDays: 1, kind: 'why_red' }, events);
    expect(result.answer).toBe('The market was down 2% today — nothing specific to WIPRO.');
  });

  it('leads with the top event explanation and stops there when it is the only one', () => {
    const events = [event({ explanation: 'WIPRO is up 3.2%, an unusually large move.' })];
    const result = composeAnswer({ symbol: 'WIPRO', sinceDays: 1, kind: 'general' }, events);
    expect(result.answer).toBe('WIPRO is up 3.2%, an unusually large move.');
  });

  it('lists up to 3 more symbols briefly after the top event', () => {
    const events = [
      event({ id: 1, symbol: 'RELIANCE', explanation: 'RELIANCE is down 4%.' }),
      event({ id: 2, symbol: 'TCS', explanation: 'TCS is down 1%.' }),
      event({ id: 3, symbol: 'WIPRO', explanation: 'WIPRO is down 2%.' }),
    ];
    const result = composeAnswer({ symbol: null, sinceDays: 1, kind: 'general' }, events);
    expect(result.answer).toBe('RELIANCE is down 4%. Also: TCS — TCS is down 1%.; WIPRO — WIPRO is down 2%..');
    expect(result.events).toHaveLength(3);
  });

  it('caps the returned source events at 4 even with more retrieved', () => {
    const events = Array.from({ length: 10 }, (_, i) => event({ id: i, symbol: `SYM${i}` }));
    const result = composeAnswer({ symbol: null, sinceDays: 1, kind: 'general' }, events);
    expect(result.events).toHaveLength(4);
  });
});
