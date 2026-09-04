-- Section 2: core schema and the append-only event log.

CREATE TABLE symbols (
  symbol      text PRIMARY KEY,
  name        text NOT NULL,
  sector      text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

-- One row per (symbol, session_date). Re-ingesting the same session
-- before/at close updates the bar in place (that's still "the truth for
-- that session" changing, not history being rewritten) — see
-- db/queries/candles.ts upsertCandle for the idempotent write.
CREATE TABLE candles (
  symbol        text NOT NULL REFERENCES symbols(symbol),
  session_date  date NOT NULL,
  ts            timestamptz NOT NULL,
  o             numeric NOT NULL,
  h             numeric NOT NULL,
  l             numeric NOT NULL,
  c             numeric NOT NULL,
  v             bigint NOT NULL,
  PRIMARY KEY (symbol, session_date)
);

CREATE TABLE corporate_actions (
  id       bigserial PRIMARY KEY,
  symbol   text NOT NULL REFERENCES symbols(symbol),
  ex_date  date NOT NULL,
  type     text NOT NULL CHECK (type IN ('split', 'bonus', 'dividend')),
  ratio    numeric NOT NULL,
  UNIQUE (symbol, ex_date, type)
);

-- The event log. Append-only, enforced at the database level below (not
-- just by convention) — corrections are new events pointing at the prior
-- id via `supersedes`, never an UPDATE of the original row.
CREATE TABLE events (
  id            bigserial PRIMARY KEY,
  symbol        text NOT NULL REFERENCES symbols(symbol),
  ts            timestamptz NOT NULL,
  kind          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  significance  numeric,
  explanation   text,
  supersedes    bigint REFERENCES events(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Ingestion idempotency: reprocessing the same (symbol, ts, kind) is a
  -- no-op, not a duplicate event. See db/queries/events.ts appendEvent.
  UNIQUE (symbol, ts, kind)
);

CREATE INDEX events_symbol_id_idx ON events (symbol, id);

CREATE FUNCTION events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % is not allowed (id=%)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_no_update
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TRIGGER events_no_delete
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE watchlist_items (
  user_id   bigint NOT NULL REFERENCES users(id),
  symbol    text NOT NULL REFERENCES symbols(symbol),
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

-- Per-(user, symbol) read offset into the event log. Cursors only ever
-- move forward — enforced in db/queries/cursors.ts ackCursor via an
-- UPSERT whose DO UPDATE is guarded by last_event_id < EXCLUDED value, so
-- a stale write from a slow/offline device can never rewind a cursor.
CREATE TABLE read_cursors (
  user_id        bigint NOT NULL REFERENCES users(id),
  symbol         text NOT NULL REFERENCES symbols(symbol),
  last_event_id  bigint NOT NULL DEFAULT 0,
  device_id      text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

-- Weekly-computed correlation clusters, cached (never on the request
-- path — see Section 4).
CREATE TABLE clusters (
  cluster_id    text NOT NULL,
  session_date  date NOT NULL,
  members       text[] NOT NULL,
  method        text NOT NULL,
  PRIMARY KEY (cluster_id, session_date)
);

CREATE INDEX clusters_session_date_idx ON clusters (session_date);
