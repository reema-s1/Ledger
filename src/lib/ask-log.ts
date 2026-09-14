/**
 * "Ask the log" — retrieval against the real `events` table. The answer
 * itself is never LLM-written: `composeAnswer` only ever selects and
 * stitches together `explanation` strings the significance engine already
 * generated, exactly as before. `parseQuestion` and `composeAnswer` are
 * pure (no I/O, directly testable); `askLog` is the thin impure
 * orchestrator the API route calls, wiring them to the real watchlist/
 * events queries. Kept in one file, one route, one component (see
 * app/api/ask/route.ts, app/components/ask-log.tsx) so the whole feature
 * can be cut cleanly if it destabilizes anything else this late.
 *
 * Two optional LLM-assisted layers, both off unless ENABLE_ASK_LOG_LLM=1
 * (isAskLogLLMEnabled, feature-flags.ts) and both never the only path to
 * an answer:
 *
 *   - parseQuestionWithLLM: called on every question, not only ones the
 *     deterministic regex parser (parseQuestion) came up empty on — a
 *     substring match can confidently land on the *wrong* symbol or
 *     sentiment just as easily as it can miss one entirely, and gating
 *     on "found nothing" would let exactly that kind of wrong-but-
 *     confident parse straight through. Only symbol and sentiment are
 *     ever replaced when the LLM call succeeds — never sinceDays, which
 *     stays the regex's own explicit keyword/date parsing in every case
 *     (a free model asked to also guess a day count defaulted to 1 for a
 *     question with no time phrase at all, where the regex's own default
 *     of 30 was already correct — date-window parsing isn't a semantic
 *     judgment call an LLM adds value to). The symbol is always
 *     validated against the real watchlist before being trusted, the
 *     same way explanation-lookup.ts validates an LLM's article pick by
 *     index into what was actually fetched, never by trusting text it
 *     generated — so a bad model answer can only ever fall back to no
 *     symbol, never resolve to the wrong one.
 *   - rephraseAnswer: takes the deterministic answer composeAnswer
 *     already built and asks an LLM to restate it more naturally — but
 *     isGrounded verifies every number and every ticker in the rephrased
 *     text already appeared in the original before it's ever shown; any
 *     mismatch (a number or symbol the rephrase introduced) discards the
 *     rephrase and falls back to the original, unaltered.
 *
 * Either layer's own failure (missing API key, network error, malformed
 * reply, a rephrase that doesn't verify) silently falls back to the
 * deterministic result — Ask the log never depends on OpenRouter being
 * up, it only ever benefits from it.
 */

import { listWatchlist } from '../../db/queries/watchlist';
import { listActiveSymbols } from '../../db/queries/symbols';
import { getEventsForSymbolSince, getEventsForSymbolsSince } from '../../db/queries/events';
import { askOpenRouter } from './openrouter';
import { isAskLogLLMEnabled } from './feature-flags';

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

/**
 * Called on every question when the flag is on (see askLog) — not just
 * ones the regex parser struck out on, since a substring match can be
 * confidently *wrong* as easily as it can be absent. The prompt lists
 * the real watchlist symbols by name so the model has something concrete
 * to match against, and is told explicitly it may only pick from that
 * list. The response format mirrors explanation-lookup.ts's ANSWER:
 * convention: robust to a reasoning model explaining itself first,
 * parsed from the last such line, never trusted blindly
 * (parseLLMParseResponse re-validates the symbol against the real list a
 * second time, independent of what the prompt asked for).
 */
export interface LLMParsedQuery {
  symbol: string | null;
  sentiment: 'up' | 'down' | null;
}

export function buildLLMParseMessages(question: string, symbolIndex: SymbolIndexEntry[]): { system: string; user: string } {
  const symbolList = symbolIndex.map((s) => `${s.symbol} (${s.name})`).join(', ');
  const system = [
    'You extract structured search parameters from a question about a stock watchlist.',
    `The only valid symbols are: ${symbolList || '(none on the watchlist)'}. Only ever pick one of these exact tickers, or NONE if the question names no specific stock or asks about the whole watchlist.`,
    'sentiment: "up" only if the question is specifically asking about a price rise/gain/green move, "down" only if specifically asking about a price fall/drop/red move, otherwise "none" — a word like "up" used in an unrelated sense (e.g. "up to date", "what\'s up") is NOT a sentiment.',
    'You may reason briefly first, but your response MUST end with exactly one final line, in plain text with no markdown formatting, in this exact form:',
    'ANSWER: symbol=<TICKER or NONE> | sentiment=<up|down|none>',
  ].join('\n');
  const user = `Question: ${question}`;
  return { system, user };
}

/**
 * Never throws; a malformed or missing ANSWER line returns null, same as
 * parseModelResponse in explanation-lookup.ts. Deliberately narrower than
 * ParsedQuery — no `days` field. A free model asked to also guess a day
 * count defaulted to 1 for a question with no time phrase at all (should
 * have been 30, the same default parseQuestion's own explicit keyword/
 * date parsing already gets right every time) — date-window parsing
 * isn't a semantic judgment call an LLM adds value to, only symbol and
 * sentiment interpretation are, so this only ever asks for those, and
 * askLog always keeps the regex's own sinceDays regardless of whether
 * this ran.
 */
export function parseLLMParseResponse(text: string, symbolIndex: SymbolIndexEntry[]): LLMParsedQuery | null {
  const cleaned = text.replace(/\*/g, '');
  const matches = [...cleaned.matchAll(/ANSWER:\s*(.+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]![1]!.trim();
  const m = /^symbol=(\S+)\s*\|\s*sentiment=(up|down|none)/i.exec(last);
  if (!m) return null;

  const symbolToken = m[1]!.toUpperCase();
  // Re-validated against the real watchlist here, independent of the
  // prompt's own instruction — the model is never trusted to have
  // actually followed it, the same defensive posture as validating an
  // article INDEX rather than a model-generated URL in explanation-lookup.
  const validSymbol = symbolIndex.find((s) => s.symbol === symbolToken)?.symbol ?? null;
  const sentimentToken = m[2]!.toLowerCase();
  const sentiment: 'up' | 'down' | null = sentimentToken === 'up' || sentimentToken === 'down' ? sentimentToken : null;

  return { symbol: validSymbol, sentiment };
}

/**
 * Called on every question when the flag is on (see askLog) — not gated
 * to only phrasing the regex struck out on, since a confident wrong
 * symbol/sentiment match is the case actually worth catching, not just a
 * missing one. Its result replaces parseQuestion's symbol and sentiment
 * (never sinceDays — see parseLLMParseResponse) whenever it succeeds.
 * Any failure (missing key, network error, malformed reply, symbol that
 * doesn't validate) returns null and the caller keeps the regex's own
 * parse entirely, exactly as it already did before this existed.
 */
export async function parseQuestionWithLLM(question: string, symbolIndex: SymbolIndexEntry[]): Promise<LLMParsedQuery | null> {
  try {
    const { system, user } = buildLLMParseMessages(question, symbolIndex);
    const reply = await askOpenRouter(system, user);
    return parseLLMParseResponse(reply, symbolIndex);
  } catch {
    return null;
  }
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

/** Every decimal or whole number in the text, as strings (so "2.80" and "2.8" are distinct — the rephrase must reuse the original's own formatting, not just an equivalent value). */
export function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/**
 * Plausible tickers: an "X&Y" pair (checked first — real NSE tickers like
 * "M&M"/"L&T" join two single letters this way, which a bare {2,} run
 * would miss on either side) or a standalone run of 2+ uppercase letters.
 * Deliberately loose — every explanation string here comes from a fixed,
 * machine-generated template (explain.ts/structured-explanation.ts),
 * never free-form prose, so stray capitalized common words aren't a real
 * risk; a false positive would only make verification stricter, never
 * looser.
 */
export function extractTickers(text: string): string[] {
  return text.match(/\b[A-Z]+&[A-Z]+\b|\b[A-Z]{2,}\b/g) ?? [];
}

/**
 * The actual safety net on the rephrase step: every number and every
 * plausible ticker the rephrased text contains must already appear
 * somewhere in the original, deterministic answer. A rephrase is free to
 * drop details, reorder, or change the sentence structure — it is never
 * free to introduce a number or a symbol that wasn't already there,
 * which is the one failure mode that actually matters for a financial
 * answer (wrong prose reads badly; a wrong number is actively harmful).
 */
export function isGrounded(original: string, rephrased: string): boolean {
  const originalNumbers = new Set(extractNumbers(original));
  const originalTickers = new Set(extractTickers(original));
  return (
    extractNumbers(rephrased).every((n) => originalNumbers.has(n)) &&
    extractTickers(rephrased).every((t) => originalTickers.has(t))
  );
}

/**
 * The rephrase prompt gets the original question too, not just the
 * answer — phrasing a reply to actually address what was asked ("why is
 * it red" vs. "what happened to X") reads more naturally than a context-
 * free restatement, even though the *facts* available to draw from are
 * identical either way.
 */
export function buildRephraseMessages(question: string, answer: string): { system: string; user: string } {
  const system = [
    'You rephrase a factual answer about stock price moves into clearer, more natural prose.',
    'You may ONLY use facts, numbers, dates, and stock symbols that already appear in the provided answer. Never add, infer, estimate, or round a number that is not already there, and never mention a stock not already named in the answer.',
    'If the answer is already clear, you may repeat it with only light changes. Do not add commentary, opinions, or anything not directly stated in the answer.',
    'You may reason briefly first, but your response MUST end with exactly one final line, in plain text with no markdown formatting, in this exact form:',
    'REPHRASED: <the rephrased answer, one paragraph>',
  ].join('\n');
  const user = `Question: ${question}\n\nAnswer: ${answer}`;
  return { system, user };
}

/** Never throws; a malformed or missing REPHRASED line returns null. */
export function parseRephraseResponse(text: string): string | null {
  const cleaned = text.replace(/\*/g, '');
  const matches = [...cleaned.matchAll(/REPHRASED:\s*(.+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]![1]!.trim();
  return last.length > 0 ? last : null;
}

/**
 * Optional, additive, never a source of new facts: on any failure
 * (missing key, network error, malformed reply) or if isGrounded rejects
 * the result, silently returns the original answer unchanged. The
 * caller never needs its own fallback branch — this function's contract
 * is "always returns something safe to show."
 */
export async function rephraseAnswer(question: string, answer: string): Promise<string> {
  try {
    const { system, user } = buildRephraseMessages(question, answer);
    const reply = await askOpenRouter(system, user);
    const rephrased = parseRephraseResponse(reply);
    if (rephrased && isGrounded(answer, rephrased)) return rephrased;
    return answer;
  } catch {
    return answer;
  }
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

  let parsed = parseQuestion(question, symbolIndex);

  // Runs on every question, not only when the regex came up empty — a
  // symbol substring can match the *wrong* thing just as easily as it can
  // match nothing (a company-name word that collides with an unrelated
  // one, a sentiment keyword used in a sense that isn't actually a
  // direction claim — "is TCS up to date with its filings" regex-matches
  // sentiment=up, wrongly), and gating this on "regex found nothing"
  // would let exactly that kind of wrong-but-confident parse through
  // unexamined. Only symbol and sentiment are ever replaced, never
  // sinceDays — see parseLLMParseResponse for why date-window parsing is
  // deliberately left to the regex's own explicit keyword/date matching
  // in every case. The symbol is validated against the real watchlist
  // inside parseLLMParseResponse regardless, so a bad model answer can
  // only ever fall back to NONE, never resolve to a wrong symbol. Any
  // failure in the call itself (missing key, network error, malformed
  // reply) leaves the regex's own parse completely untouched.
  if (isAskLogLLMEnabled()) {
    const llmParsed = await parseQuestionWithLLM(question, symbolIndex);
    if (llmParsed) {
      parsed = {
        ...parsed,
        symbol: llmParsed.symbol,
        sentiment: llmParsed.sentiment,
        kind: llmParsed.sentiment !== null ? 'why_red' : 'general',
      };
    }
  }

  const sinceIso = new Date(Date.now() - parsed.sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = parsed.symbol
    ? await getEventsForSymbolSince(parsed.symbol, sinceIso, MAX_EVENTS)
    : await getEventsForSymbolsSince(watchlistSymbols, sinceIso, MAX_EVENTS);

  const result = composeAnswer(parsed, rows.map(toAskLogEvent));

  // Rephrasing never changes `events` (the sources list) — only the
  // prose, and only once isGrounded has confirmed it introduced no new
  // number or symbol beyond what composeAnswer already produced.
  if (isAskLogLLMEnabled() && result.events.length > 0) {
    const answer = await rephraseAnswer(question, result.answer);
    return { ...result, answer };
  }

  return result;
}
