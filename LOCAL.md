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
npm run seed                     # generates data/seed-dataset.json (130 trading sessions, ending today)
npm run sync-symbols              # loads the 40 symbols into the `symbols` table
npm run sync-corporate-actions    # loads the seeded 1:5 split into `corporate_actions`
npm run clusters:recompute        # computes clusters (needs sync-symbols first)
npm run seed-demo-user            # creates the demo user + a 12-symbol starter watchlist
npm run worker                    # backfills 130 sessions of candles + events — let it run ~20-30s, then Ctrl+C
```

**Why `npm run seed` first, and why re-run it before a demo**: the seed
dataset's calendar is anchored to *today* at the moment you generate it
(not a fixed date), specifically so the digest's "Today / This week /
Earlier" tiers have something in each bucket. If you set this up once and
come back to demo it three weeks later, everything will have visually
aged into "Earlier" — just re-run the six commands above (takes under a
minute) and it's fresh again. This is a deliberate design tradeoff,
explained in the README's Section 1 and Deployment notes.

**Why the worker needs to actually run for ~20-30s**: it's not a seed
script, it's the real long-lived ingestion process — backfilling 130
sessions × 40 symbols means running the real significance engine ~5,200
times, writing every candle and every event that clears the bar. Watch
the console; when it settles into occasional single-symbol log lines
(instead of a continuous stream), it's caught up. Ctrl+C is safe at any
point — it's idempotent, and re-running it later only processes new days.

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

---

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

- **`/symbol/BAJFINANCE`** — has all three of the hardest resilience
  cases in one page: a `corporate action` line (*"executed a 1:5 split
  today"*) with **normal-magnitude moves on either side of it**, not a
  false -80% scream; and multiple `event resolved` lines (*"dropped 4.4%,
  gave back all of it since"*).
- **`/symbol/WIPRO`** — the deliberately-seeded structural-break symbol.
  Click **Why grouped?** under its cluster to see the real pairwise
  correlation values behind the grouping (not just the label).
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
fallback (depends on how much history is in the DB — 130 seeded sessions
is enough for real correlation clustering to run).

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

54 tests across significance (the five required fixtures from the
brief), clustering, the worker's resilience pieces, and digest
compaction — all pure-function unit tests, no DB required.

## Troubleshooting

- **"port 5434 already allocated"** — something else is using it; either
  stop that, or change the port in both `docker-compose.yml` and `.env`.
- **`npm run dev` picks a port other than 3000** — normal, something
  else on your machine already has 3000. The terminal output tells you
  the actual URL.
- **Digest looks empty right after setup and "Show me anyway" shows
  nothing useful** — the worker backfill (step 3's last command) probably
  didn't finish. Re-run `npm run worker` and let it run longer.
- **Clusters page says "grouped by sector"** instead of showing real
  correlation clusters — `npm run clusters:recompute` needs 90+ sessions
  of history in the DB to engage real correlation clustering; make sure
  the worker backfill actually completed (5,200 candles expected: 40
  symbols × 130 sessions) before recomputing.
