-- Item 22: attach the source article's real published timestamp, not
-- just a bare link — already available from the Google News RSS <pubDate>
-- (src/lib/explanation-lookup.ts's NewsItem.pubDate) but was being
-- discarded before this. A verbatim quoted excerpt from inside the
-- article was considered too (the other half of item 22) but isn't
-- implemented: the RSS feed only ever provided a title/link/pubDate,
-- never full article text, so there is nothing to quote from without a
-- second fetch-and-parse step against arbitrary news sites' HTML — a
-- materially bigger, fragile, dependency-risking change, flagged here
-- rather than faked with a fabricated "quote."

ALTER TABLE event_explanations
  ADD COLUMN source_published_at timestamptz;
