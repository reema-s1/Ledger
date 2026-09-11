# Ledger

Most watchlists show current state and leave you to work out what
changed. Ledger shows the diff.

**Live demo:** [ledger-diff.vercel.app](https://ledger-diff.vercel.app) · **Try it:** click "Try as Guest" — no sign-up, instant seeded account.

![Landing screen](docs/screenshots/landing.png)

## The idea, in two bets

**1. Read-cursor model.** Every symbol writes into an append-only event
log; every user holds a per-symbol read offset. "What's new" is
`log[since your offset:]`, computed on read — not fetched-as-state and
diffed in the UI. Reading advances the cursor explicitly, never
implicitly, so multi-device sync isn't a feature bolted on afterward —
it falls straight out of the data model.

**2. Structural break, not price move.** A 12-stock watchlist is usually
three or four correlated bets, not twelve independent ones. A move fully
explained by the market or the sector isn't news — the unexplained
residual is. Most days, nothing clears that bar, and that's the product
working, not a fallback screen.

## What it actually does

![The digest](docs/screenshots/digest.png)

Every card leads with a sentence, not a ticker and a percentage —
toggle to **Detailed** and see the real math behind it (residual after
subtracting market and cluster movement, confirmed by volume). Click
**Mark seen** and it's a real cursor acknowledgment sent to the server,
not a local checkbox — two devices can never un-read each other.

Not every big move is news, and the last 20 alerts get graded after the
fact — "flagged 172 days ago, still diverged" — so the product keeps
score on itself instead of leaving stale alerts sitting there forever.
Below that, **Ask the log** answers plain-English questions ("why is my
portfolio red today?") by retrieving straight from the real event log —
no LLM call, no hallucination risk, every answer traceable to its source:

![Ask the log, resolution clauses, and the accountability stat line](docs/screenshots/ask-the-log.png)

A watchlist is a real, personal list — add or remove any symbol, any time:

![Watchlist](docs/screenshots/watchlist.png)

And the real thesis: symbols aren't independent. Correlation clustering
groups the ones that actually move together, with the real numbers one
click away on "Why grouped?":

![Correlation clusters](docs/screenshots/clusters.png)

**Playback** is time-travel for the watchlist — reconstructs the digest
and cluster grouping exactly as they looked on any earlier day, live
from the event log, not a separate recording:

![Playback scrubber](docs/screenshots/playback.png)

## Under the hood

Next.js (App Router, TS) + Postgres (plain SQL, no ORM) + a standalone
long-lived Node worker for ingestion — two-source conflict detection,
corporate-action adjustment (splits/bonuses), tiered polling,
retrospective alert grading. A live telemetry page at `/system` shows the
real polling tier and interval per symbol, every source disagreement the
worker has actually caught, and the trade-offs behind each — not
illustrative numbers, the running system's own state.

Every symbol's events, candles, and clusters are computed once and
shared by every user watching it — a stock followed by a hundred
watchlists is still ingested once. The only thing that grows per user is
a handful of tiny read-cursor rows, so watchlist size and user count
barely touch the cost path.

## Data, honestly

- **Historical candles — real.** ~130 trading sessions per symbol
  (40 NSE stocks + NIFTY), pulled once from Yahoo Finance's `.NS`
  endpoint (`npm run fetch-real-history`) and committed as a static
  snapshot — correlation clustering runs on real sector co-movement, not
  planted correlation.
- **Corporate actions — real, but none in the current window.** The same
  fetch pulls real split/bonus events where Yahoo has them (it found a
  real KOTAKBANK split outside the current 130-session range); none of
  the 40 symbols happened to split within this specific window, so the
  corporate-action adjustment path is real but untriggered right now,
  not staged.
- **Live quotes — not real.** `DATA_MODE` defaults to `replay`; the
  `live` fetcher (`src/lib/quotes/live-provider-stub.ts`) is a deliberate
  stub that fails loudly rather than fake a feed, because this repo
  doesn't hold NSE vendor credentials.
- **Two-source conflict detection — the logic is real and tested, the
  second source isn't independent yet.** In replay mode the "secondary"
  source is the primary wrapped with jitter plus one injected
  disagreement, so `reconcileQuotes` has something real to catch; in live
  mode there's no second vendor wired in at all. The reconciliation
  algorithm itself doesn't change if a genuine second vendor is added —
  only `worker/sources.ts` would.
- **Replay mode still exists, on purpose** — for deterministic
  demo-safety when markets are closed — but it now replays the real
  historical data above, deterministically, not a synthetic generator.
  The synthetic generator (`src/seed/generate.ts`) is untouched as an
  automatic fallback: delete `data/real-nse-history.json` and `npm run
  seed` reverts to it instantly, loudly logging that it did.

Full technical write-up (schema, significance engine, clustering math,
resilience cases, deployment) is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Run it locally

```bash
npm install && cp .env.example .env
docker compose up -d db && npm run db:migrate
npm run seed && npm run sync-symbols && npm run sync-corporate-actions \
  && npm run clusters:recompute && npm run seed-demo-user
npm run worker    # let it run ~20-30s, then Ctrl+C
npm run dev
```

`data/real-nse-history.json` is committed, so `npm run seed` uses real
data out of the box — `npm run fetch-real-history` only needs running
again to refresh the window.

Full setup notes, troubleshooting, and a click-through feature checklist:
[`LOCAL.md`](LOCAL.md).
