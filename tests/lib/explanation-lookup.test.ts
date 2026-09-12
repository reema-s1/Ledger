import { describe, it, expect } from 'vitest';
import {
  parseGoogleNewsRss,
  filterByDateWindow,
  buildNewsSearchUrl,
  buildGroundingMessages,
  parseModelResponse,
  type NewsItem,
} from '../../src/lib/explanation-lookup';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Reliance shares fall on Q2 miss - moneycontrol.com</title>
    <link>https://news.google.com/rss/articles/abc123</link>
    <pubDate>Wed, 10 Sep 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Some &amp; unrelated &quot;story&quot;</title>
    <link>https://news.google.com/rss/articles/def456</link>
    <pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('parseGoogleNewsRss', () => {
  it('extracts title, link, and pubDate from each item', () => {
    const items = parseGoogleNewsRss(SAMPLE_RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Reliance shares fall on Q2 miss - moneycontrol.com',
      link: 'https://news.google.com/rss/articles/abc123',
      pubDate: 'Wed, 10 Sep 2026 09:00:00 GMT',
    });
  });

  it('decodes HTML entities in titles', () => {
    const items = parseGoogleNewsRss(SAMPLE_RSS);
    expect(items[1]!.title).toBe('Some & unrelated "story"');
  });

  it('returns an empty array for XML with no items', () => {
    expect(parseGoogleNewsRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('filterByDateWindow', () => {
  const items: NewsItem[] = [
    { title: 'in window', link: 'a', pubDate: 'Mon, 08 Sep 2026 09:00:00 GMT' },
    { title: 'exact day', link: 'b', pubDate: 'Wed, 10 Sep 2026 09:00:00 GMT' },
    { title: 'too early', link: 'c', pubDate: 'Mon, 01 Jun 2026 09:00:00 GMT' },
    { title: 'too late', link: 'd', pubDate: 'Fri, 20 Sep 2026 09:00:00 GMT' },
  ];
  const eventDate = new Date('2026-09-10T15:30:00Z');

  it('keeps articles within a few days before through the event date', () => {
    const kept = filterByDateWindow(items, eventDate).map((i) => i.title);
    expect(kept).toContain('in window');
    expect(kept).toContain('exact day');
  });

  it('excludes articles well before or after the event', () => {
    const kept = filterByDateWindow(items, eventDate).map((i) => i.title);
    expect(kept).not.toContain('too early');
    expect(kept).not.toContain('too late');
  });

  it('excludes an item with an unparseable pubDate rather than throwing', () => {
    const bad: NewsItem[] = [{ title: 'bad date', link: 'x', pubDate: 'not-a-date' }];
    expect(filterByDateWindow(bad, eventDate)).toEqual([]);
  });
});

describe('buildNewsSearchUrl', () => {
  it('scopes the search itself to the event window with after:/before: operators', () => {
    // Google News' default search is recency-biased — without these
    // operators in the query, a months-old event never matches anything
    // Google actually returns, regardless of what news existed at the time.
    const url = buildNewsSearchUrl('Bajaj Finance', new Date('2026-03-09T10:00:00Z'));
    expect(url).toContain('news.google.com/rss/search');
    expect(url).toContain(encodeURIComponent('after:2026-03-06'));
    expect(url).toContain(encodeURIComponent('before:2026-03-12'));
  });
});

describe('buildGroundingMessages', () => {
  it('numbers every item and includes the required ANSWER format in the system prompt', () => {
    const items: NewsItem[] = [{ title: 'Article One', link: 'a', pubDate: 'Wed, 10 Sep 2026 09:00:00 GMT' }];
    const { system, user } = buildGroundingMessages('RELIANCE', '2026-09-10', items);
    expect(system).toContain('ANSWER: FOUND:');
    expect(system).toContain('ANSWER: NOT_FOUND');
    expect(system).toMatch(/only what the provided articles/i);
    expect(user).toContain('1. "Article One"');
    expect(user).toContain('RELIANCE');
  });
});

describe('parseModelResponse', () => {
  const items: NewsItem[] = [
    { title: 'First', link: 'a', pubDate: 'x' },
    { title: 'Second', link: 'b', pubDate: 'y' },
  ];

  it('parses a valid ANSWER: FOUND line and resolves the referenced article by index', () => {
    const result = parseModelResponse('ANSWER: FOUND:2 | The company reported strong earnings.', items);
    expect(result).toEqual({ index: 1, summary: 'The company reported strong earnings.' });
  });

  it('returns null for an ANSWER: NOT_FOUND response', () => {
    expect(parseModelResponse('ANSWER: NOT_FOUND', items)).toBeNull();
  });

  it('finds the ANSWER line even after several paragraphs of reasoning, and strips markdown around it', () => {
    const verbose = [
      'Looking at the articles, none published on the exact flagged date mention this company.',
      'Article 1 is about a different, similarly-named company, so it does not count.',
      '',
      '**ANSWER: NOT_FOUND**',
    ].join('\n');
    expect(parseModelResponse(verbose, items)).toBeNull();

    const verboseFound = [
      'Article 2 directly discusses this company\'s earnings miss.',
      '**ANSWER: FOUND:2 | The company missed earnings expectations.**',
    ].join('\n');
    expect(parseModelResponse(verboseFound, items)).toEqual({ index: 1, summary: 'The company missed earnings expectations.' });
  });

  it('returns null (never throws) for a malformed or off-format response', () => {
    expect(parseModelResponse('Sure, I think article 1 might be related!', items)).toBeNull();
  });

  it('returns null when FOUND references an index outside the retrieved list', () => {
    expect(parseModelResponse('ANSWER: FOUND:99 | whatever', items)).toBeNull();
  });

  it('uses the last ANSWER line when the model restates its conclusion', () => {
    const text = 'ANSWER: NOT_FOUND\n\nWait, actually, re-reading article 1:\nANSWER: FOUND:1 | It explains a regulatory fine.';
    expect(parseModelResponse(text, items)).toEqual({ index: 0, summary: 'It explains a regulatory fine.' });
  });
});
