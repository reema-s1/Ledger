-- Provenance, not correctness: the significance engine's rolling windows
-- (beta, residual stdev, volume median, correlation) are never at risk of
-- blending replay and live data, because worker/ingest.ts re-fetches full
-- history from the current DATA_MODE's QuoteSource on every single
-- ingestion cycle - there's no accumulated internal state to blend. What
-- IS missing without this column: a way to tell, just by looking at a
-- stored candle, whether it came from the synthetic/replay path or a real
-- live fetch - this makes that auditable at the row level, the same way
-- `confirmed`/`source` already record two-source reconciliation state.

ALTER TABLE candles
  ADD COLUMN data_mode text NOT NULL DEFAULT 'replay';
