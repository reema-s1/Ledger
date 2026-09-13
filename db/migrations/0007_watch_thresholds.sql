-- Item 19: an optional per-symbol, per-user personal reminder threshold
-- ("notify me if this moves more than X%, regardless of significance") —
-- a manual override a user sets for themselves, never a second scoring
-- system. Deliberately its own table, not a column on watchlist_items:
-- this is personal preference data, not part of "what symbols does this
-- user track," and keeping it separate means removing a symbol from the
-- watchlist doesn't have to make a decision about whether to also drop
-- this. Must be real server-side storage (not localStorage) so it
-- survives across devices the same way everything else in this product
-- does — a personal reminder that silently disappeared on a different
-- device would be a real regression, not a shortcut.

CREATE TABLE watch_thresholds (
  user_id        bigint NOT NULL REFERENCES users(id),
  symbol         text NOT NULL REFERENCES symbols(symbol),
  threshold_pct  numeric NOT NULL CHECK (threshold_pct > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);
