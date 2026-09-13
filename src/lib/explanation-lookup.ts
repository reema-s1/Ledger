/**
 * "Find possible explanation" (llm-addition.md) — on-demand, search-
 * grounded, never automatic. Two independent, genuinely free steps, no
 * payment method needed on either account:
 *
 *   1. Google News RSS (no API key) for real articles near the event date.
 *   2. OpenRouter's `openrouter/free` model router (no paid search plugin)
 *      judges/summarizes ONLY those articles, under a strict instruction
 *      never to add outside knowledge or speculate beyond them.
 *
 * If step 1 finds nothing plausibly relevant, step 2 never runs at all —
 * never force a speculative answer when there's nothing to ground it in.
 * The LLM is asked to pick an article by INDEX into the list this module
 * already fetched, never to reproduce a URL itself — LLMs aren't reliable
 * at reproducing exact URLs from context, so the real source_url/
 * source_title always come from what was actually fetched, never from
 * the model's own output text.
 */

// `openrouter/free` is a *router* across whatever free models are
// currently available, verified (3 real calls, same input) to silently
// switch models between calls and land on wildly unsuited ones — a code-
// completion model among them — with directly contradictory answers on
// identical input. A named model is a genuinely free choice too, just
// without that per-call model-lottery risk. Picked after comparing several
// real free models on the same input: this one correctly distinguished
// similarly-named-but-different companies (e.g. "Bajaj Finance" vs "Bajaj
// Housing Finance") that other candidates conflated - the exact judgment
// call this feature's safety depends on.
const OPENROUTER_MODEL = 'inclusionai/ling-3.0-flash-fin:free';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search';
// Real "why did X happen" coverage typically lags a move by a day or two
// (reporting/analysis takes time) rather than preceding it — a narrow
// same-day-only "after" window meant the single most relevant article for
// a real test case (published the day after the flagged move, specifically
// explaining it) fell just outside the search, while less-relevant
// "stocks to watch" pieces from days *before* the move stayed in. Biased
// the window forward to match how financial reporting actually lands.
const WINDOW_DAYS_BEFORE = 3;
const WINDOW_DAYS_AFTER = 3;

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
}

export interface ExplanationLookupResult {
  found: boolean;
  hypothesis: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  /**
   * The article's own real published timestamp (item 22), straight from
   * Google News RSS's <pubDate> — not just a bare link. A verbatim quoted
   * excerpt from inside the article was also asked for, but isn't
   * implemented: the RSS feed only ever gives a title/link/pubDate, never
   * the article's body text, so there is nothing real to quote without a
   * second fetch-and-parse step against arbitrary news sites' HTML (a
   * materially bigger, fragile, dependency-risking change). Flagged
   * honestly rather than fabricating a "quote" from the headline alone.
   */
  sourcePublishedAt: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateWindow(eventDate: Date): { start: Date; end: Date } {
  return {
    start: new Date(eventDate.getTime() - WINDOW_DAYS_BEFORE * 24 * 60 * 60 * 1000),
    end: new Date(eventDate.getTime() + WINDOW_DAYS_AFTER * 24 * 60 * 60 * 1000),
  };
}

/**
 * Google News' default search is recency-biased — a plain query for a
 * well-known company returns whatever's being said about it *right now*,
 * not what was said months ago when a flagged move actually happened.
 * `after:`/`before:` are real Google search date operators that also
 * work through the RSS search endpoint, so the search itself is scoped to
 * the event's window instead of relying on a client-side filter against
 * results that were never going to include anything that old.
 */
export function buildNewsSearchUrl(companyName: string, eventDate: Date): string {
  const { start, end } = dateWindow(eventDate);
  const q = encodeURIComponent(`${companyName} after:${isoDate(start)} before:${isoDate(end)}`);
  return `${GOOGLE_NEWS_RSS_URL}?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/**
 * Google News RSS's <item> blocks are simple and regular enough that a
 * hand-rolled parser is safer scope-wise than adding an XML dependency for
 * one isolated, easily-cut feature (see feature-flags.ts). Decodes the
 * handful of HTML entities Google actually emits here — this is not a
 * general-purpose HTML decoder.
 */
export function parseGoogleNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1]!;
    const title = decodeEntities(extractTag(block, 'title'));
    const link = decodeEntities(extractTag(block, 'link'));
    const pubDate = extractTag(block, 'pubDate');
    if (title && link && pubDate) items.push({ title, link, pubDate });
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
  if (!m) return '';
  return m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * A defensive second pass, not the real filtering mechanism — the search
 * query itself is already date-scoped (buildNewsSearchUrl). This only
 * catches the rare case where Google's `after:`/`before:` operators admit
 * something just outside the requested window.
 */
export function filterByDateWindow(items: NewsItem[], eventDate: Date): NewsItem[] {
  const { start, end } = dateWindow(eventDate);
  return items.filter((item) => {
    const t = new Date(item.pubDate).getTime();
    return !Number.isNaN(t) && t >= start.getTime() && t <= end.getTime();
  });
}

export function buildGroundingMessages(
  symbol: string,
  eventDate: string,
  items: NewsItem[],
): { system: string; user: string } {
  const system = [
    'You are checking whether a set of real news search results explains a stock price move.',
    'Summarize ONLY what the provided articles actually say. Never use outside knowledge, never speculate, never guess a cause the articles do not state.',
    'The articles were already filtered to the relevant window of days around the flagged move - judge relevance by whether an article genuinely explains a price move for this exact company (not a similarly-named but different company), not by requiring an exact date match to the flagged date.',
    'You may reason briefly first, but your response MUST end with exactly one final line, in plain text with no markdown formatting, in one of these two forms:',
    'ANSWER: FOUND:<article number> | <one-sentence summary of what that specific article says>',
    'ANSWER: NOT_FOUND',
  ].join('\n');

  const list = items.map((item, i) => `${i + 1}. "${item.title}" (published ${item.pubDate})`).join('\n');
  const user = `Symbol: ${symbol}\nFlagged move date: ${eventDate}\n\nSearch results:\n${list}\n\nDo any of these genuinely explain the price move? End with the required ANSWER line.`;

  return { system, user };
}

/**
 * Robust to reasoning models that explain themselves before concluding
 * (verified empirically — several free models do this despite being told
 * not to) and to markdown wrapping around the answer. Anchors to the
 * "ANSWER:" marker rather than requiring it to open the response, takes
 * the last such line if there are several, and never throws on a
 * malformed reply — treats it as NOT_FOUND.
 */
export function parseModelResponse(text: string, items: NewsItem[]): { index: number; summary: string } | null {
  const cleaned = text.replace(/\*/g, '');
  const matches = [...cleaned.matchAll(/ANSWER:\s*(.+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]![1]!.trim();
  if (/^NOT_FOUND/i.test(last)) return null;
  const m = /^FOUND:\s*(\d+)\s*\|\s*(.+)/i.exec(last);
  if (!m) return null;
  const index = parseInt(m[1]!, 10) - 1;
  if (index < 0 || index >= items.length) return null;
  return { index, summary: m[2]!.trim() };
}

async function fetchNewsItems(companyName: string, eventDate: Date): Promise<NewsItem[]> {
  const res = await fetch(buildNewsSearchUrl(companyName, eventDate), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();
  return filterByDateWindow(parseGoogleNewsRss(xml), eventDate);
}

async function askOpenRouter(system: string, user: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter: empty response');
  return content;
}

/** The real entry point. `companyName` and `eventDate` are the caller's job to look up (see app/api). */
export async function lookupExplanation(
  symbol: string,
  companyName: string,
  eventDate: Date,
): Promise<ExplanationLookupResult> {
  const items = await fetchNewsItems(companyName, eventDate);
  if (items.length === 0) {
    return { found: false, hypothesis: null, sourceUrl: null, sourceTitle: null, sourcePublishedAt: null };
  }

  const { system, user } = buildGroundingMessages(symbol, eventDate.toISOString().slice(0, 10), items);
  const reply = await askOpenRouter(system, user);
  const parsed = parseModelResponse(reply, items);
  if (!parsed) {
    return { found: false, hypothesis: null, sourceUrl: null, sourceTitle: null, sourcePublishedAt: null };
  }

  const article = items[parsed.index]!;
  return {
    found: true,
    hypothesis: parsed.summary,
    sourceUrl: article.link,
    sourceTitle: article.title,
    sourcePublishedAt: article.pubDate,
  };
}
