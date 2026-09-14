import { describe, it, expect } from 'vitest';
import {
  parseQuestion,
  composeAnswer,
  buildLLMParseMessages,
  parseLLMParseResponse,
  extractNumbers,
  extractTickers,
  isGrounded,
  buildRephraseMessages,
  parseRephraseResponse,
  type AskLogEvent,
  type SymbolIndexEntry,
  type ParsedQuery,
} from '../../src/lib/ask-log';

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

function query(overrides: Partial<ParsedQuery>): ParsedQuery {
  return { symbol: null, sinceDays: 1, kind: 'general', sentiment: null, ...overrides };
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

  it('defaults sinceDays to 30 when no time phrase is mentioned', () => {
    expect(parseQuestion('why is WIPRO down', SYMBOL_INDEX).sinceDays).toBe(30);
    expect(parseQuestion('how is reliance doing', SYMBOL_INDEX).sinceDays).toBe(30);
  });

  it('narrows to 1 day on an explicit "today"', () => {
    expect(parseQuestion('why is my portfolio red today', SYMBOL_INDEX).sinceDays).toBe(1);
  });

  it('widens to 7 days on "last/past/this week"', () => {
    expect(parseQuestion('what happened last week', SYMBOL_INDEX).sinceDays).toBe(7);
    expect(parseQuestion('what happened this week', SYMBOL_INDEX).sinceDays).toBe(7);
  });

  it('widens to 30 days on "last/past/this month"', () => {
    expect(parseQuestion('what happened to TCS last month', SYMBOL_INDEX).sinceDays).toBe(30);
    expect(parseQuestion('what happened to TCS this month', SYMBOL_INDEX).sinceDays).toBe(30);
  });

  it('widens to 2 days on "yesterday"', () => {
    expect(parseQuestion('what happened yesterday', SYMBOL_INDEX).sinceDays).toBe(2);
  });

  it('reads an explicit "last/past N days" window', () => {
    expect(parseQuestion('anything in the past 30 days', SYMBOL_INDEX).sinceDays).toBe(30);
    expect(parseQuestion('what happened in the last 5 days', SYMBOL_INDEX).sinceDays).toBe(5);
  });

  it('reads an explicit typed date range as the window start', () => {
    const now = new Date('2026-09-05T00:00:00.000Z');
    // Mar 12 2026 -> Sep 5 2026 is 177 days
    expect(parseQuestion('why wipro down 12Mar - 20 Jul', SYMBOL_INDEX, now).sinceDays).toBe(177);
    expect(parseQuestion('what happened from March 12 to July 20', SYMBOL_INDEX, now).sinceDays).toBe(177);
  });

  it('folds a typed date into the previous year when it would otherwise land in the future', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    // "20 Dec" relative to Jan 10 2026 must mean Dec 20 2025, not a future date
    expect(parseQuestion('what happened on 20 Dec', SYMBOL_INDEX, now).sinceDays).toBe(21);
  });

  it('reads a bare month name ("since Jan") as the 1st of that month', () => {
    const now = new Date('2026-09-05T00:00:00.000Z');
    // Jan 1 2026 -> Sep 5 2026 is 247 days
    expect(parseQuestion('why is reliance down since jan', SYMBOL_INDEX, now).sinceDays).toBe(247);
  });

  it('prefers a day-qualified date over a bare month name mentioned alongside it', () => {
    const now = new Date('2026-09-05T00:00:00.000Z');
    expect(parseQuestion('what happened from March 12 to July 20', SYMBOL_INDEX, now).sinceDays).toBe(177);
  });

  it('detects why_red intent and "down" sentiment from "red"/"down"/"drop" language', () => {
    expect(parseQuestion('why is my portfolio red today', SYMBOL_INDEX).kind).toBe('why_red');
    expect(parseQuestion('why is my portfolio red today', SYMBOL_INDEX).sentiment).toBe('down');
    expect(parseQuestion('why did WIPRO drop', SYMBOL_INDEX).sentiment).toBe('down');
  });

  it('detects "up" sentiment from "green"/"up"/"gained"/"rose" language', () => {
    expect(parseQuestion('why is my portfolio green today', SYMBOL_INDEX).sentiment).toBe('up');
    expect(parseQuestion('why is my portfolio green today', SYMBOL_INDEX).kind).toBe('why_red');
    expect(parseQuestion('why did WIPRO gain today', SYMBOL_INDEX).sentiment).toBe('up');
    expect(parseQuestion('why did TCS rise', SYMBOL_INDEX).sentiment).toBe('up');
  });

  it('leaves sentiment null for direction-neutral questions', () => {
    expect(parseQuestion('what happened to WIPRO last month', SYMBOL_INDEX).sentiment).toBeNull();
  });

  it('does not read the "what\'s up" idiom as an "up" sentiment claim', () => {
    expect(parseQuestion("what's up with WIPRO", SYMBOL_INDEX).sentiment).toBeNull();
    expect(parseQuestion("what's up with WIPRO", SYMBOL_INDEX).kind).toBe('what_happened');
    expect(parseQuestion("what's up today", SYMBOL_INDEX).sentiment).toBeNull();
    expect(parseQuestion('whats up with TCS', SYMBOL_INDEX).sentiment).toBeNull();
    // a real direction claim alongside "what's" still reads as "up"
    expect(parseQuestion("what's happening, is WIPRO up today", SYMBOL_INDEX).sentiment).toBe('up');
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
    const result = composeAnswer(query({ symbol: 'WIPRO' }), []);
    expect(result.answer).toBe('Nothing flagged for WIPRO in that window.');
    expect(result.events).toEqual([]);
  });

  it('reports nothing cleared the bar for the whole watchlist with no events', () => {
    const result = composeAnswer(query({}), []);
    expect(result.answer).toBe('Nothing on your watchlist cleared the significance bar in that window.');
  });

  it('surfaces the reassurance explanation for a why_red whole-watchlist question with only reassurance events', () => {
    const events = [event({ kind: 'reassurance', explanation: 'The market was down 2% today — nothing specific to WIPRO.' })];
    const result = composeAnswer(query({ kind: 'why_red', sentiment: 'down' }), events);
    expect(result.answer).toBe('The market was down 2% today — nothing specific to WIPRO.');
  });

  it('leads with the top event explanation and stops there when it is the only one', () => {
    const events = [event({ explanation: 'WIPRO is up 3.2%, an unusually large move.' })];
    const result = composeAnswer(query({ symbol: 'WIPRO' }), events);
    expect(result.answer).toBe('WIPRO is up 3.2%, an unusually large move.');
  });

  it('lists up to 3 more symbols briefly after the top event', () => {
    const events = [
      event({ id: 1, symbol: 'RELIANCE', explanation: 'RELIANCE is down 4%.' }),
      event({ id: 2, symbol: 'TCS', explanation: 'TCS is down 1%.' }),
      event({ id: 3, symbol: 'WIPRO', explanation: 'WIPRO is down 2%.' }),
    ];
    const result = composeAnswer(query({}), events);
    expect(result.answer).toBe('RELIANCE is down 4%. Also: TCS — TCS is down 1%.; WIPRO — WIPRO is down 2%..');
    expect(result.events).toHaveLength(3);
  });

  it('caps the returned source events at 4 even with more retrieved', () => {
    const events = Array.from({ length: 10 }, (_, i) => event({ id: i, symbol: `SYM${i}` }));
    const result = composeAnswer(query({}), events);
    expect(result.events).toHaveLength(4);
  });

  it('a "why is it green" question only answers with up-moving events, ignoring a more significant down move', () => {
    const events = [
      event({ id: 1, symbol: 'TECHM', explanation: 'TECHM is down 2.6%, an unusually large move.', significance: 2.5 }),
      event({ id: 2, symbol: 'RELIANCE', explanation: 'RELIANCE is up 2.3%, an unusually large move.', significance: 1.8 }),
    ];
    const result = composeAnswer(query({ kind: 'why_red', sentiment: 'up' }), events);
    expect(result.answer).toBe('RELIANCE is up 2.3%, an unusually large move.');
  });

  it('a "why is it green" question with only down-moving events says so, instead of answering with the wrong direction', () => {
    const events = [event({ symbol: 'TECHM', explanation: 'TECHM is down 2.6%, an unusually large move.' })];
    const result = composeAnswer(query({ kind: 'why_red', sentiment: 'up' }), events);
    expect(result.answer).toBe('Nothing on your watchlist moved up in that window — 1 other move happened instead.');
  });

  it('a symbol-specific direction mismatch says the symbol did not move that way', () => {
    const events = [event({ symbol: 'WIPRO', explanation: 'WIPRO is down 2.6%, an unusually large move.' })];
    const result = composeAnswer(query({ symbol: 'WIPRO', kind: 'why_red', sentiment: 'up' }), events);
    expect(result.answer).toBe("WIPRO didn't move up in that window.");
  });
});

describe('buildLLMParseMessages', () => {
  it('lists the real watchlist symbols and requires the ANSWER format in the system prompt', () => {
    const { system, user } = buildLLMParseMessages('how has wipro been lately', SYMBOL_INDEX);
    expect(system).toContain('WIPRO (Wipro Limited)');
    expect(system).toContain('TCS (Tata Consultancy Services)');
    expect(system).toContain('ANSWER: symbol=<TICKER or NONE>');
    expect(user).toContain('how has wipro been lately');
  });

  it('says no valid symbols when the watchlist is empty, rather than an empty list', () => {
    const { system } = buildLLMParseMessages('anything happening', []);
    expect(system).toContain('(none on the watchlist)');
  });
});

describe('parseLLMParseResponse', () => {
  it('parses a valid ANSWER line into a ParsedQuery', () => {
    const result = parseLLMParseResponse('ANSWER: symbol=WIPRO | days=7 | sentiment=down', SYMBOL_INDEX);
    expect(result).toEqual({ symbol: 'WIPRO', sinceDays: 7, kind: 'why_red', sentiment: 'down' });
  });

  it('maps symbol=NONE and sentiment=none to null, kind general', () => {
    const result = parseLLMParseResponse('ANSWER: symbol=NONE | days=30 | sentiment=none', SYMBOL_INDEX);
    expect(result).toEqual({ symbol: null, sinceDays: 30, kind: 'general', sentiment: null });
  });

  it('rejects a symbol the model picked that is not actually on the watchlist', () => {
    // The model naming a real ticker that just isn't on THIS watchlist is
    // exactly the case re-validation exists for - never trust the model's
    // word over the real list, even when its answer is well-formed.
    const result = parseLLMParseResponse('ANSWER: symbol=INFY | days=30 | sentiment=none', SYMBOL_INDEX);
    expect(result?.symbol).toBeNull();
  });

  it('finds the ANSWER line after reasoning text and strips markdown around it', () => {
    const verbose = '**ANSWER: symbol=TCS | days=1 | sentiment=up**';
    expect(parseLLMParseResponse(verbose, SYMBOL_INDEX)?.symbol).toBe('TCS');
  });

  it('returns null (never throws) for a malformed or off-format response', () => {
    expect(parseLLMParseResponse('Sure, I think this is about WIPRO!', SYMBOL_INDEX)).toBeNull();
  });

  it('returns null when there is no ANSWER line at all', () => {
    expect(parseLLMParseResponse('', SYMBOL_INDEX)).toBeNull();
  });
});

describe('extractNumbers', () => {
  it('extracts every decimal and whole number from a sentence', () => {
    expect(extractNumbers('Down 0.8% while the market was down 0.4%. That’s 2.8 standard deviations, on 4x normal volume.')).toEqual([
      '0.8',
      '0.4',
      '2.8',
      '4',
    ]);
  });

  it('returns an empty array when there are no numbers', () => {
    expect(extractNumbers('Nothing flagged in that window.')).toEqual([]);
  });
});

describe('extractTickers', () => {
  it('extracts plausible all-caps tickers, including ones joined by &', () => {
    expect(extractTickers('RELIANCE and M&M both moved today')).toEqual(['RELIANCE', 'M&M']);
  });

  it('does not extract ordinary capitalized words as tickers', () => {
    // Single letters and short/mixed-case words shouldn't false-positive.
    expect(extractTickers('The Market was Up today')).toEqual([]);
  });
});

describe('isGrounded', () => {
  const original = 'RELIANCE is down 2.5% while the market was down 0.4%. That’s 2.8 standard deviations.';

  it('accepts a rephrase that only reuses numbers and tickers already in the original', () => {
    expect(isGrounded(original, 'RELIANCE dropped 2.5% today, a notable 2.8 standard deviation move.')).toBe(true);
  });

  it('rejects a rephrase that introduces a number not in the original', () => {
    expect(isGrounded(original, 'RELIANCE dropped 2.5% on 3.2x normal volume.')).toBe(false);
  });

  it('rejects a rephrase that introduces a stock symbol not in the original', () => {
    expect(isGrounded(original, 'RELIANCE and TCS both dropped 2.5% today.')).toBe(false);
  });

  it('accepts a rephrase that drops detail without adding anything new', () => {
    expect(isGrounded(original, 'RELIANCE moved down 2.5% today.')).toBe(true);
  });
});

describe('buildRephraseMessages', () => {
  it('includes the original question and answer, and requires the REPHRASED format', () => {
    const { system, user } = buildRephraseMessages('why is reliance down', 'RELIANCE is down 2.5%.');
    expect(system).toContain('REPHRASED: <the rephrased answer, one paragraph>');
    expect(system).toMatch(/only use facts, numbers, dates, and stock symbols/i);
    expect(user).toContain('why is reliance down');
    expect(user).toContain('RELIANCE is down 2.5%.');
  });
});

describe('parseRephraseResponse', () => {
  it('parses a valid REPHRASED line', () => {
    expect(parseRephraseResponse('REPHRASED: RELIANCE dropped 2.5% today.')).toBe('RELIANCE dropped 2.5% today.');
  });

  it('finds the REPHRASED line after reasoning text and strips markdown around it', () => {
    const verbose = 'Let me restate this clearly.\n**REPHRASED: RELIANCE dropped 2.5% today.**';
    expect(parseRephraseResponse(verbose)).toBe('RELIANCE dropped 2.5% today.');
  });

  it('returns null (never throws) when there is no REPHRASED line', () => {
    expect(parseRephraseResponse('Sure, here you go.')).toBeNull();
  });
});
