/**
 * "Ask the log" — retrieval against the real `events` table, never an
 * LLM call. `parseQuestion` and `composeAnswer` are pure (no I/O,
 * directly testable); `askLog` is the thin impure orchestrator the API
 * route calls, wiring them to the real watchlist/events queries. Kept in
 * one file, one route, one component (see app/api/ask/route.ts,
 * app/components/ask-log.tsx) so the whole feature can be cut cleanly if
 * it destabilizes anything else this late.
 */

import { listWatchlist } from '../../db/queries/watchlist';
import { listActiveSymbols } from '../../db/queries/symbols';
import { getEventsForSymbolSince, getEventsForSymbolsSince } from '../../db/queries/events';

export interface SymbolIndexEntry {
  symbol: string;
  name: string;
}

export type AskLogIntent = 'why_red' | 'what_happened' | 'general';

export interface ParsedQuery {
  symbol: string | null;
  sinceDays: number;
  kind: AskLogIntent;
}

export interface AskLogEvent {
  id: number;
  symbol: string;
  kind: string;
  ts: string;
  explanation: string | null;
  significance: number | null;
}

export interface AskLogResult {
  answer: string;
  events: AskLogEvent[];
}

const MAX_EVENTS = 20;
const ANSWER_EVENT_CAP = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every token worth matching a symbol on: the ticker itself, plus any
 * word from the company name at least 4 characters long (skips short
 * filler like "the"/"ltd" that would false-positive against unrelated
 * questions). No NLP — plain substring/word-boundary matching, as
 * specified.
 */
function buildSymbolTokens(entries: SymbolIndexEntry[]): { symbol: string; token: string }[] {
  const out: { symbol: string; token: string }[] = [];
  for (const entry of entries) {
    const seen = new Set<string>();
    const candidates = [
      entry.symbol.toLowerCase(),
      ...entry.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
    ];
    for (const token of candidates) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      out.push({ symbol: entry.symbol, token });
    }
  }
  return out;
}

/**
 * Parses free text into (symbol, time window, intent). Never throws and
 * never requires a match — an unmatched symbol/intent is `null`/'general'
 * by construction, which the caller already treats as "whole watchlist,
 * no particular angle" (the scope guardrail: fall back, don't error).
 */
export function parseQuestion(question: string, symbolIndex: SymbolIndexEntry[]): ParsedQuery {
  const lower = question.toLowerCase();

  let symbol: string | null = null;
  let bestTokenLength = 0;
  for (const { symbol: sym, token } of buildSymbolTokens(symbolIndex)) {
    if (token.length <= bestTokenLength) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`);
    if (pattern.test(lower)) {
      symbol = sym;
      bestTokenLength = token.length;
    }
  }

  let sinceDays = 1;
  if (/\b(last|past)\s+month\b/.test(lower)) sinceDays = 30;
  else if (/\b(last|past)\s+week\b/.test(lower)) sinceDays = 7;
  else if (/\byesterday\b/.test(lower)) sinceDays = 2;

  let kind: AskLogIntent = 'general';
  if (/\b(red|down|drop(ped)?|fell|falling|crash(ed|ing)?)\b/.test(lower)) kind = 'why_red';
  else if (/what(?:'s| is| happened| happening)/.test(lower)) kind = 'what_happened';

  return { symbol, sinceDays, kind };
}

/**
 * Turns retrieved rows into one short sentence built from their own
 * `explanation` strings — no new language is generated, only selected
 * and stitched. `events` must already be in the caller's chosen order
 * (recency for a single symbol, significance for the whole watchlist);
 * this function only ever reads `events[0]` as "the top one."
 */
export function composeAnswer(parsed: ParsedQuery, events: AskLogEvent[]): AskLogResult {
  if (events.length === 0) {
    const answer = parsed.symbol
      ? `Nothing flagged for ${parsed.symbol} in that window.`
      : 'Nothing on your watchlist cleared the significance bar in that window.';
    return { answer, events: [] };
  }

  if (parsed.kind === 'why_red' && !parsed.symbol && events.every((e) => e.kind === 'reassurance')) {
    const top = events[0]!;
    return {
      answer: top.explanation ?? 'This looks like a market-wide move, nothing specific to one stock.',
      events: events.slice(0, ANSWER_EVENT_CAP),
    };
  }

  const top = events[0]!;
  const rest = events.slice(1, ANSWER_EVENT_CAP);
  let answer = top.explanation ?? `${top.symbol} had a flagged event with no stored explanation.`;
  if (rest.length > 0) {
    const briefs = rest.map((e) => `${e.symbol} — ${e.explanation ?? 'flagged, no explanation stored'}`);
    answer += ` Also: ${briefs.join('; ')}.`;
  }
  return { answer, events: events.slice(0, ANSWER_EVENT_CAP) };
}

function toAskLogEvent(e: { id: number; symbol: string; kind: string; ts: Date; explanation: string | null; significance: number | null }): AskLogEvent {
  return { id: e.id, symbol: e.symbol, kind: e.kind, ts: e.ts.toISOString(), explanation: e.explanation, significance: e.significance };
}

/** The real entry point: question + user in, retrieval + composed answer out. */
export async function askLog(question: string, userId: number): Promise<AskLogResult> {
  const watchlist = await listWatchlist(userId);
  const watchlistSymbols = watchlist.map((w) => w.symbol);
  if (watchlistSymbols.length === 0) {
    return { answer: 'Your watchlist is empty — add a symbol first.', events: [] };
  }

  const activeSymbols = await listActiveSymbols();
  const watchlistSet = new Set(watchlistSymbols);
  const symbolIndex: SymbolIndexEntry[] = activeSymbols
    .filter((s) => watchlistSet.has(s.symbol))
    .map((s) => ({ symbol: s.symbol, name: s.name }));

  const parsed = parseQuestion(question, symbolIndex);
  const sinceIso = new Date(Date.now() - parsed.sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = parsed.symbol
    ? await getEventsForSymbolSince(parsed.symbol, sinceIso, MAX_EVENTS)
    : await getEventsForSymbolsSince(watchlistSymbols, sinceIso, MAX_EVENTS);

  return composeAnswer(parsed, rows.map(toAskLogEvent));
}
