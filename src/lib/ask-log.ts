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
  /** "red"/"down" -> 'down', "green"/"up" -> 'up', else null. Drives direction-aware filtering in composeAnswer. */
  sentiment: 'up' | 'down' | null;
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

const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Reads explicit calendar dates out of free text ("12 Mar", "12Mar", "March
 * 12th") — the day/month keyword phrases above ("last week") don't cover a
 * typed range like "12Mar - 20 Jul". No year is ever typed, so each date is
 * resolved against `now`'s year, folding back a year if that lands in the
 * future (asking about a range always means a past range).
 */
function parseExplicitDates(text: string, now: Date): Date[] {
  const dates: Date[] = [];
  const patterns = [
    /\b(\d{1,2})(?:st|nd|rd|th)?\s*([a-z]{3,9})\b/gi,
    /\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const first = m[1]!;
      const second = m[2]!;
      const firstIsNumeric = /^\d+$/.test(first);
      const day = parseInt(firstIsNumeric ? first : second, 10);
      const monthToken = (firstIsNumeric ? second : first).slice(0, 3).toLowerCase();
      const month = MONTH_ABBR[monthToken];
      if (month === undefined || day < 1 || day > 31) continue;
      let candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
      if (candidate.getTime() > now.getTime()) {
        candidate = new Date(Date.UTC(now.getUTCFullYear() - 1, month, day));
      }
      dates.push(candidate);
    }
  }

  // "since Jan" / "in March" name a month with no day at all — only read as
  // the 1st of that month when no day-qualified date matched above, so it
  // never overrides a more specific date already found (e.g. "March 12").
  if (dates.length === 0) {
    const bareMonthRe = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = bareMonthRe.exec(text))) {
      const month = MONTH_ABBR[m[1]!.slice(0, 3).toLowerCase()];
      if (month === undefined) continue;
      let candidate = new Date(Date.UTC(now.getUTCFullYear(), month, 1));
      if (candidate.getTime() > now.getTime()) {
        candidate = new Date(Date.UTC(now.getUTCFullYear() - 1, month, 1));
      }
      dates.push(candidate);
    }
  }

  return dates;
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
export function parseQuestion(question: string, symbolIndex: SymbolIndexEntry[], now: Date = new Date()): ParsedQuery {
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

  // No time phrase mentioned defaults to 30, not 1 — most questions ("how's
  // reliance doing", a bare ticker) name no window at all, and a 1-day
  // default made nearly every one of them come back empty against data
  // that's flagged and graded over weeks. "Today" stays an explicit 1-day ask.
  let sinceDays = 30;
  if (/\btoday\b/.test(lower)) sinceDays = 1;
  else if (/\byesterday\b/.test(lower)) sinceDays = 2;
  else if (/\b(?:last|past|this)\s+week\b/.test(lower)) sinceDays = 7;
  else if (/\b(?:last|past|this)\s+month\b/.test(lower)) sinceDays = 30;
  else {
    const daysMatch = /\b(?:last|past)\s+(\d+)\s+days?\b/.exec(lower);
    if (daysMatch) sinceDays = parseInt(daysMatch[1]!, 10);
  }

  // An explicit typed date ("12Mar - 20 Jul") always wins over the vague
  // keywords above — it's the most specific window the user could give.
  const explicitDates = parseExplicitDates(lower, now);
  if (explicitDates.length > 0) {
    const earliest = explicitDates.reduce((min, d) => (d < min ? d : min));
    sinceDays = Math.max(1, Math.ceil((now.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000)));
  }

  // "what's up (with X)" is a greeting, not a direction claim — strip the
  // idiom before scanning for sentiment words, or every "what's up" question
  // gets misread as asking about an upward move.
  const sentimentSource = lower.replace(/\bwhat(?:'s| is|s)\s+up\b/g, ' ');
  let sentiment: 'up' | 'down' | null = null;
  if (/\b(red|down|drop(ped)?|fell|falling|crash(ed|ing)?)\b/.test(sentimentSource)) sentiment = 'down';
  else if (/\b(green|up|gain(ed)?|rose|ris(e|ing)|rall(y|ied|ying)|surge[ds]?)\b/.test(sentimentSource)) sentiment = 'up';

  let kind: AskLogIntent = 'general';
  if (sentiment !== null) kind = 'why_red';
  else if (/what(?:'s| is| happened| happening)/.test(lower)) kind = 'what_happened';

  return { symbol, sinceDays, kind, sentiment };
}

/** Reads the direction an explanation string already states — the same "subject's own move" pattern ColorizedHeadline colors. */
function extractDirection(explanation: string | null): 'up' | 'down' | null {
  if (!explanation) return null;
  const match = /\b(up|down|spiked|dropped|rose|fell)\s+[\d.]+%/i.exec(explanation);
  if (!match) return null;
  const word = match[1]!.toLowerCase();
  return word === 'down' || word === 'dropped' || word === 'fell' ? 'down' : 'up';
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

  // "Why is my portfolio red/green" must actually answer the direction asked,
  // not just whatever the most significant event happened to be — a "green"
  // question surfacing a down-move explanation reads as broken, not helpful.
  let candidates = events;
  if (parsed.sentiment) {
    const matching = events.filter((e) => extractDirection(e.explanation) === parsed.sentiment);
    if (matching.length === 0) {
      const word = parsed.sentiment;
      const answer = parsed.symbol
        ? `${parsed.symbol} didn't move ${word} in that window.`
        : `Nothing on your watchlist moved ${word} in that window — ${events.length} other move${events.length === 1 ? '' : 's'} happened instead.`;
      return { answer, events: events.slice(0, ANSWER_EVENT_CAP) };
    }
    candidates = matching;
  }

  if (parsed.kind === 'why_red' && !parsed.symbol && candidates.every((e) => e.kind === 'reassurance')) {
    const top = candidates[0]!;
    return {
      answer: top.explanation ?? 'This looks like a market-wide move, nothing specific to one stock.',
      events: candidates.slice(0, ANSWER_EVENT_CAP),
    };
  }

  const top = candidates[0]!;
  const rest = candidates.slice(1, ANSWER_EVENT_CAP);
  let answer = top.explanation ?? `${top.symbol} had a flagged event with no stored explanation.`;
  if (rest.length > 0) {
    const briefs = rest.map((e) => `${e.symbol} — ${e.explanation ?? 'flagged, no explanation stored'}`);
    answer += ` Also: ${briefs.join('; ')}.`;
  }
  return { answer, events: candidates.slice(0, ANSWER_EVENT_CAP) };
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
