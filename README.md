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

- **Historical candles — real.** ~220 trading sessions per symbol
  (40 NSE stocks + NIFTY), pulled once from Yahoo Finance's `.NS`
  endpoint (`npm run fetch-real-history`) and committed as a static
  snapshot — correlation clustering runs on real sector co-movement, not
  planted correlation.
- **Corporate actions — real, and actually triggered.** The same fetch
  pulls real split/bonus events where Yahoo has them; the window was
  deliberately widened (past the ~130 sessions a demo strictly needs) to
  land a real one inside it — KOTAKBANK's real 5:1 split on 2026-01-14.
  Backfilling against it produces exactly one `corporate_action` event
  and zero false price-move events that day (verified — see
  `ARCHITECTURE.md` Section 5), so the adjustment path is exercised
  against real data, not just unit-tested against a synthetic fixture.
  Running the retrospective grading job for real afterward
  (`npm run resolve-alerts`) graded 19 flagged moves: 8 held, 1 partially
  reverted, 10 reverted.
- **Live quotes — real, single source.** `DATA_MODE` still defaults to
  `replay` for demo-safety, but setting it to `live` pulls real current
  prices from the same Yahoo Finance endpoint as the historical data
  (`src/lib/quotes/yahoo-live-fetcher.ts`), not a stub.
- **Two-source conflict detection — the logic is real and tested, the
  second source isn't independent yet.** In both replay and live mode
  the "secondary" source is the same primary quote wrapped with jitter
  (replay also injects one deliberate disagreement), so
  `reconcileQuotes` has something real to catch. A genuinely independent
  second live vendor is the one honest gap left: NSE's own site blocks
  non-browser traffic (confirmed with a 403, even with a proper session
  handshake), and no other free source with real NSE coverage was
  reachable. The reconciliation algorithm itself doesn't change if a
  real second vendor is added later — only `worker/sources.ts` would.
- **Replay mode still exists, on purpose** — for deterministic
  demo-safety when markets are closed — but it now replays the real
  historical data above, deterministically, not a synthetic generator.
  The synthetic generator (`src/seed/generate.ts`) is untouched as an
  automatic fallback: delete `data/real-nse-history.json` and `npm run
  seed` reverts to it instantly, loudly logging that it did.

## Where an LLM is used — and where it deliberately isn't

An LLM was considered and ruled out for clustering (real correlation math
is already fully explainable — an LLM would make it opaque and
non-deterministic for no benefit) and for price prediction (no free,
validated model exists for NSE-specific forecasting, and an unvalidated
prediction undermines the one thing this product is actually trying to
be trustworthy about). Ask the log stays retrieval-only for the same
reason — no LLM, no hallucination risk, every word traceable to a real
event.

The one place an LLM is used: **"Find possible explanation,"** an
on-demand button on a flagged move's card (off by default —
`ENABLE_EXPLANATION_LOOKUP=1`). Clicking it searches real, dated news for
that symbol (Google News RSS, no API key), and — only if something
plausibly relevant turns up — asks an LLM (OpenRouter, a free-tier model)
to summarize *only* what those articles say, under a strict instruction
never to add outside knowledge or speculate beyond them. If nothing
relevant is found, the LLM is never even called. The result is stored
separately from the event's real explanation (its own table, never
touching `events`), and is always shown as a visually secondary,
explicitly labeled **"Possible explanation (unverified)"** block with a
source link — never styled or worded to look as certain as the
deterministic significance math above it. The significance engine
remains the trusted, certain core; this is a dismissible, sourced,
clearly-secondary layer on top of a move it already flagged — never a
new detection mechanism of its own.

## Known limitations, stated plainly

- **Statistics are observation-based, not standardized.** A residual
  z-score is computed against this stock's own rolling window (default
  60 sessions), not a textbook "20-day" or "52-week" figure — and since
  hot/warm/cold symbols poll at different intervals (Section 5), it's a
  *prioritization* heuristic ("does this deserve attention relative to
  its own recent history"), not a volatility measure that's safe to
  compare across symbols.
- **NSE holidays and early closes aren't modeled** — only the weekly
  Mon-Fri, 09:15-15:30 IST calendar (`src/lib/time/market-calendar.ts`).
  A real holiday table is a follow-up, not a hidden gap.
- **`user_id` as a query param stands in for real session auth** — there's
  no login, no password, no per-request identity check. Fine for a single
  seeded demo user; a real deployment needs actual auth before this scales
  past one person.
- **The worker is one long-lived process, not a fleet.** Every write it
  makes is idempotent (unique constraints + `ON CONFLICT`), so running a
  second instance wouldn't corrupt anything — it would just poll the same
  vendor twice as often for no benefit. Scaling ingestion further means
  sharding symbols across workers, not just adding replicas.
- **No extra event-dedup/escalation layer beyond what the schema already
  guarantees.** A `(symbol, ts, kind)` unique constraint means at most one
  significance event per symbol per session, and the digest (Section 6)
  already narrates a multi-day continuing move as one episode rather than
  a fresh card per day — so a suppression/escalation layer on top (the
  kind a tick-by-tick alerting system needs) would be solving a problem
  this daily-bar architecture doesn't have.

Full growth-path (what changes under real load) and every verified cursor
edge case are in `ARCHITECTURE.md`'s Deployment and Section 6.

## Out of scope, on purpose

Real session auth/multi-user login, a genuinely independent second live
vendor (NSE's own site blocks non-browser traffic — confirmed, not just
assumed), push/websocket delivery (the digest is pull-based by design —
cursors are what make "what's new" a read-time query instead of a
push subscription), and horizontal autoscaling of the worker. None of
these are missing by oversight — each is a deliberate line, and the
reasoning for each is in `ARCHITECTURE.md`.

Full technical write-up (schema, significance engine, clustering math,
resilience cases, deployment) is in [`ARCHITECTURE.md`](ARCHITECTURE.md).
129 tests across 16 files (`npx vitest run`) — pure-function unit tests,
no DB required.

## Run it locally

```bash
npm install && cp .env.example .env
docker compose up -d db && npm run db:migrate
npm run seed && npm run sync-symbols && npm run sync-corporate-actions \
  && npm run clusters:recompute && npm run seed-demo-user
npm run backfill    # deterministic: ingests every seeded session in one pass, no timing guesswork
npm run dev
```

`data/real-nse-history.json` is committed, so `npm run seed` uses real
data out of the box — `npm run fetch-real-history` only needs running
again to refresh the window.

Full setup notes, troubleshooting, and a click-through feature checklist:
[`LOCAL.md`](LOCAL.md).
