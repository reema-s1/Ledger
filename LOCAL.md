# Running Ledger locally

Everything needed to get the app running on your machine, what to click
to see each feature actually work, and where to look when something
doesn't.

## Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres) — or any Postgres 14+ instance you
  already have running
- ~5 minutes

## 1. Install and configure

```bash
npm install
cp .env.example .env
```

`.env` already points at a local Postgres on port **5434**, not 5432 —
that port is deliberately non-default because 5432 is commonly already
taken by another local install (it was on the machine this was built on).
If you already have something on 5434 too, edit `DATABASE_URL` in `.env`
and the port mapping in `docker-compose.yml` to match.

## 2. Start Postgres and set up the schema

```bash
docker compose up -d db
npm run db:migrate
```

`db:migrate` is safe to re-run — it only applies migrations not already
recorded in `schema_migrations`.

## 3. Generate the market data and seed the DB

Run these **in order** — each depends on the one before it:

```bash
npm run seed                     # generates data/seed-dataset.json (~220 real trading sessions)
npm run sync-symbols              # loads the 40 symbols into the `symbols` table
npm run sync-corporate-actions    # loads the real corporate actions found in this window into `corporate_actions`
npm run clusters:recompute        # computes clusters (needs sync-symbols first)
npm run seed-demo-user            # creates the demo user + a 12-symbol starter watchlist
npm run backfill                  # ingests every seeded session in one deterministic pass (candles + events)
```

**Why `npm run seed` first, and why re-run it before a demo**: the seed
dataset's calendar is anchored to *today* at the moment you generate it
(not a fixed date), specifically so the digest's "Today / This week /
Earlier" tiers have something in each bucket. If you set this up once and
come back to demo it three weeks later, everything will have visually
aged into "Earlier" — just re-run the six commands above (takes under a
minute) and it's fresh again. This is a deliberate design tradeoff,
explained in the README's Section 1 and Deployment notes.

**Why a separate `npm run backfill` instead of just running the worker**:
`npm run worker` is the real long-lived ingestion process — the one that
actually runs in production, polling each symbol at its watchlist tier's
interval (5s/30s/300s, Section 5) forever. Waiting for it to visit every
symbol at least once for a first-time local setup means waiting on the
slowest (cold) tier's real-world interval. `backfill` calls the exact same
`ingestSymbol` function once per symbol back-to-back instead, so a fresh
database is fully caught up (candles + events for every seeded session)
in one deterministic pass — no timing guesswork, no partial state if you
Ctrl+C too early. Once you're set up, `npm run worker` is what you'd run
to keep watching for genuinely new sessions; re-running either command
later only processes days not already in `candles` (idempotent).

## 4. Run the app

```bash
npm run dev
```

Open **http://localhost:3000** (or whatever port it prints — it'll pick
a different one if 3000 is already taken by something else on your
machine).

## Resetting the demo data

If you want a clean slate (e.g. after playing with add/remove watchlist,
or clicking "Mark all read" everywhere):

```bash
docker exec -it $(docker ps -qf name=ledger-db) psql -U ledger -d ledger -c "DELETE FROM read_cursors WHERE user_id=1;"
```

This un-reads everything for the demo user without touching any
underlying event data — the digest goes back to showing everything as
new. To fully regenerate from scratch instead (fresh dates, fresh
prices), re-run all of step 3.

### Scripted, deterministic full reset

For a demo that has to reproduce the same beats every time (a recorded
walkthrough, a judged run-through), this sequence rebuilds every
ingestion-derived table from the committed real dataset and re-ingests it
in one deterministic pass — no waiting on the clock, no "did the worker
catch up yet":

```bash
# 1. wipe everything the ingestion pipeline derives (never touches users/watchlist_items)
docker exec -it $(docker ps -qf name=ledger-db) psql -U ledger -d ledger \
  -c "TRUNCATE candles, events, event_explanations, ingest_status, corporate_actions RESTART IDENTITY CASCADE;"

# 2. re-load the fixed real corporate action, then re-ingest every session in one pass
npm run sync-corporate-actions
npm run backfill

# 3. re-run retrospective grading so the accountability stat line is populated too
npm run resolve-alerts
```

There's no separate "inject an event" step because none is needed — the
committed dataset already has fixed, known events at fixed positions
(KOTAKBANK's real split, an injected two-source conflict on ICICIBANK,
see `worker/sources.ts`), so every run of this sequence reproduces the
exact same corporate-action card, the exact same source-conflict entry on
`/system`, and the exact same resolved/reverted split in the accountability
stat line — deterministically, from real market data, not scripted fakes.

## What to check, screen by screen

### `/` — Digest (home)

The core "diff" screen. Two states, both real, both worth showing:

- **Populated** (default state after setup): cards grouped into
  **Today** (individual events, full plain-sentence detail),
  **This week** (multi-day narratives — *"TORNTPHARM drifted down 1.7%
  over 1 session"*), and **Earlier** (one line per symbol with net
  change, no matter how many underlying events — this is what keeps
  someone gone for months from getting a wall of 40,000 events). Click
  **Seen** on a card, or **Mark all read** — the digest updates
  immediately (it's a real cursor ack, not a local-only UI state).
- **Empty**: after acking everything, reload — *"Nothing needs you
  today."* Click **Show me anyway** to expand the actual residual
  z-scores for every watchlisted symbol's latest session, computed live,
  whether or not they cleared the bar. This is the single best "prove
  it" moment in the demo.

### `/watchlist` — Watchlist management

Add or remove symbols from the dropdown. Changes are real (hits
`/api/watchlist`, persisted to Postgres) — refresh and they stick.

### `/symbol/[SYMBOL]` — Symbol detail

The best individual symbols to look at, and why:

- **`/symbol/KOTAKBANK`** — has the real corporate-action case: a
  `corporate action` line (*"executed a 1:5 split today"*, 2026-01-14,
  a real Yahoo Finance split event) with **normal-magnitude moves on
  either side of it**, not a false -80% scream. (This replaces the
  synthetic BAJFINANCE fixture below, which only applies if you delete
  `data/real-nse-history.json` and fall back to generated data.)
- **`/symbol/WIPRO`** — click **Why grouped?** under its cluster to see
  the real pairwise correlation values behind the grouping (not just the
  label), and often has multiple `event resolved` lines (*"dropped X%,
  gave back all of it since"*) since it trades in the same cluster as
  the real move activity above.
- Any symbol shows a price sparkline, freshness/confirmation markers
  (quiet, not a red banner — Section 5's requirement), and its recent
  event history.

### `/clusters` — Cluster view

One hand-drawn SVG, no chart library. Each cluster is a loose ring of
symbol nodes around a labelled center; a symbol with a recent flagged
move drifts further from center and picks up color (amber for a plain
move, red for a structural break) — literally *"the breaking node
drifting out"* from the brief. Method line at the top tells you honestly
whether you're looking at real correlation clustering or the sector
fallback (depends on how much history is in the DB — 90+ sessions is
enough for real correlation clustering to run; the shipped real dataset
has ~220).

---

## Features that don't show up by clicking around — verify these separately

Some of the brief's requirements are about the **ingestion worker's**
resilience, not the UI. To actually see them:

- **Two-source conflict**: `worker/sources.ts` deliberately injects one
  disagreement into a replay-mode "secondary" quote feed. Run
  `npm run worker` and watch for a line like
  `sources disagree by 5.00% — marked unconfirmed, skipping significance`.
  That symbol's candle for that day is written with `confirmed = false`
  (check the `candles` table) and never produces a price-move event.
- **Tiered polling / backpressure**: not visible in a short demo run
  (intervals are minutes-to-seconds apart) — see `worker/polling-tiers.ts`
  and `worker/backpressure.ts`, both fully unit-tested
  (`npx vitest run tests/worker`).
- **Idempotency**: run `npm run worker` a second time right after the
  first finishes. It should log almost nothing (no new session dates to
  process) and the event count in the DB won't change.

## Running the tests

```bash
npx vitest run
```

129 tests across 16 files: significance (the five required fixtures from
the brief), clustering, the worker's resilience pieces, digest
compaction, explanation lookup, and the ask-the-log retrieval path — all
pure-function unit tests, no DB required.

## Troubleshooting

- **"port 5434 already allocated"** — something else is using it; either
  stop that, or change the port in both `docker-compose.yml` and `.env`.
- **`npm run dev` picks a port other than 3000** — normal, something
  else on your machine already has 3000. The terminal output tells you
  the actual URL.
- **Digest looks empty right after setup and "Show me anyway" shows
  nothing useful** — `npm run backfill` (step 3's last command) probably
  errored partway through, or ran before `npm run seed`. Re-run it; it's
  idempotent and safe to repeat.
- **Clusters page says "grouped by sector"** instead of showing real
  correlation clusters — `npm run clusters:recompute` needs 90+ sessions
  of history in the DB to engage real correlation clustering; make sure
  `npm run backfill` actually completed (~8,800 candles expected: 40
  symbols × ~220 sessions) before recomputing.
