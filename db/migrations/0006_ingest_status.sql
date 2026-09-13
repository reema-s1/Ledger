-- Section 5's IngestOutcome ('no-history' | 'unconfirmed' | 'corporate-action'
-- | 'first-session' | 'no-cluster' | 'insufficient-cluster-history' |
-- 'evaluated') already exists as a type but was never persisted anywhere —
-- the worker computed it, logged only the interesting subset to the
-- console, and threw the rest away. That made "why hasn't this symbol
-- flagged anything" indistinguishable from "the engine looked and found
-- nothing" versus "the engine never actually got to look" (no cluster yet,
-- insufficient peer history, sources disagreed). This table is a one-row-
-- per-symbol latest-status mirror, upserted every ingestion cycle, so
-- /system can show the real reason instead of silence.

CREATE TABLE ingest_status (
  symbol         text PRIMARY KEY REFERENCES symbols(symbol),
  session_date   date,
  outcome        text NOT NULL,
  checked_at     timestamptz NOT NULL DEFAULT now()
);
