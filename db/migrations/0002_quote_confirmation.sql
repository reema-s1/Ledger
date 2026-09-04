-- Section 5: surface two-source confirmation state and freshness at the
-- row level, instead of silently picking a source or discarding the
-- disagreement.

ALTER TABLE candles
  ADD COLUMN confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN source text NOT NULL DEFAULT 'unknown';
