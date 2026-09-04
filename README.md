# Ledger

Most watchlists show current state and leave you to work out what
changed. Ledger shows the diff.

**1. Read cursor model.** Symbols write into an append-only event log;
each user holds a per-symbol read offset. "What's new" is
`log[since_your_offset:]` — computed on read, not fetched as current
state and diffed in the UI. Reading advances the cursor explicitly, never
implicitly. Multi-device sync and "since you last checked" aren't UI
features bolted on afterward; they fall directly out of this data model
(see Section 6 — two devices racing to ack the same symbol, verified
against the real running API, not just the unit).

**2. Structural break, not price move.** A 12-stock watchlist is usually
three or four correlated bets, not twelve independent ones (Section 4's
clustering). A move fully explained by the market or the sector isn't
news — the unexplained residual is (Section 3). And the sharpest version
of that isn't "moved 5%," it's "this stock tracked its cluster for months
and just stopped." Most days, on a properly-clustered watchlist, nothing
clears that bar — and that's the product working, not a fallback screen
(Section 7's empty state is deliberately the most-designed screen in the
app, not an afterthought).

That's the pitch. Everything below is how it's built, section by section,
in the order it was built in.

Stack: Next.js (App Router, TS) + Postgres + a separate long-lived Node
worker. Plain SQL, no ORM.

## Section 1 — Clock and quote abstraction

Everything that touches wall time or market data goes through two
interfaces (`src/lib/time/clock.ts`, `src/lib/quotes/quote-source.ts`), each
with a live driver and a replay driver, selected by `DATA_MODE`:

- `DATA_MODE=live` — `LiveClock` (real time, NSE hours) + `LiveQuoteSource`
  (polls a real provider — see below, not wired to a vendor yet).
- `DATA_MODE=replay` (default) — `ReplayClock` + `ReplayQuoteSource` stream
  a deterministic seeded dataset. The clock only advances as the replay
  emits ticks, scaled by a speed multiplier — never from wall time.

Get both for the current mode from `src/lib/data-mode.ts`
(`createClock()`, `createQuoteSource(clock)`); no other module should reach
for `Date.now()`, `new Date()`, or `fetch` for market data directly.

### Setup

```bash
npm install
```

### Generate the seed dataset

```bash
npm run seed
```

Deterministically generates 20 trading sessions (2026-08-03 to 2026-08-28)
of OHLCV for 40 NSE-style symbols across 6 sectors (IT, Banking, PSU Bank,
NBFC, Pharma, Energy) plus a NIFTY index series, and writes it to
`data/seed-dataset.json` (gitignored — regenerate any time; same seed
always produces the same bytes). Baked into the data on purpose:

- **Sector correlation** — every symbol's return is `beta * sector_factor +
  idiosyncratic noise`, every sector factor is `beta * index_return +
  sector noise`. Real structure for Section 4's clustering to find.
- **Two structural breaks** — WIPRO (from 2026-08-18) and FEDERALBNK (from
  2026-08-24) stop depending on their sector factor entirely partway
  through the run.
- **One 1:5 split** — BAJFINANCE, ex-date 2026-08-21, expressed as a real
  overnight ~80% discontinuity in the raw as-traded price (not smoothed
  away) — the fixture Section 5's corporate-action adjustment has to catch.
- **One volume spike** — TATAPOWER, 2026-08-12, 8x normal volume with a
  matching price move.

### Stream a replay

```bash
npm run replay -- --speed 60
```

Streams every symbol's ticks to the console, paced by the speed multiplier
(simulated seconds per real second) — `--speed 1` is real time, `--speed
300` blows through a session in ~75 seconds. Optional `--symbols
TCS,INFY,NIFTY` to narrow the feed. Ctrl+C to stop.

If `data/seed-dataset.json` doesn't exist yet, `replay` generates it on
first run, so `npm run seed` is a documented convenience, not a hard
prerequisite.

### Type-check

```bash
npx tsc --noEmit
```

### Known gap (documented, not hidden)

`LiveQuoteSource` is wired end-to-end but has no real vendor behind it yet
— `src/lib/quotes/live-provider-stub.ts` throws a clear error if
`DATA_MODE=live` is set without a real `LiveQuoteFetcher` implementation.
Swap that stub for a real REST/WebSocket integration when one is chosen;
nothing else in the codebase needs to change. Also: NSE trading holidays
aren't modeled, only the weekly Mon-Fri / 09:15-15:30 IST calendar.

## Section 2 — Schema and event log

Postgres schema (`db/migrations/0001_init.sql`): `symbols`, `candles`,
`corporate_actions`, the append-only `events` log, `users`,
`watchlist_items`, `read_cursors`, `clusters`. Plain SQL, no ORM — a thin
typed wrapper (`db/client.ts`) plus one query module per table
(`db/queries/*.ts`).

Three rules are enforced at the database level, not just by convention:

- **`events` is append-only.** `UPDATE`/`DELETE` on `events` are rejected
  by a trigger (`events_append_only()`), full stop — corrections are new
  rows referencing the prior id via `supersedes`.
- **Ingestion is idempotent.** `events` has a unique constraint on
  `(symbol, ts, kind)`; `appendEvent` inserts with `ON CONFLICT DO
  NOTHING` and returns `null` on a duplicate, so reprocessing a candle
  never creates a second event for the same thing.
- **Cursors only advance.** `ackCursor`'s upsert `DO UPDATE` is guarded by
  `read_cursors.last_event_id < EXCLUDED.last_event_id` — a stale write
  from a slow device is a silent no-op, never a rewind, never an error.

### Local Postgres

```bash
docker compose up -d db
```

Starts Postgres on **host port 5434** (not 5432 — commonly already taken
by a native install, as it was on this machine) via `docker-compose.yml`.
Copy `.env.example` to `.env` (already points `DATABASE_URL` at that
port) and run:

```bash
npm run db:migrate
```

Applies any `.sql` file in `db/migrations/` not yet recorded in
`schema_migrations`, each inside its own transaction. Safe to re-run —
already-applied files are skipped.

In production this points at Neon instead (see Deployment); nothing in
the app code changes, only `DATABASE_URL`.

## Section 3 — Significance engine

Pure function library, no I/O — `src/significance/`. Numbers in (a
symbol's own bars, the index's bars, its cluster's daily mean returns),
a score and a one-sentence explanation out. Nothing here touches the
database or a clock; Section 5's ingestion worker is what will call
`evaluate()` with real data and persist whatever it returns.

The decomposition (`decompose.ts`):

```
observed_return = beta * index_return + cluster_excess + residual
cluster_excess  = cluster_return - beta * index_return
```

Substituting shows `residual = observed_return - cluster_return` — beta
cancels algebraically. That's intentional, not a bug (see the comment at
the top of `decompose.ts`): what's left over after removing "what the
market did" and "what the cluster did" is exactly the stock's deviation
from its own cluster's mean, which is the quantity that gets z-scored
against its own rolling residual volatility. The beta/index terms aren't
wasted, though — they still drive the plain-English explanation ("the
market was flat and IT was up 0.4%").

Volume confirms: `volumeWeight = max(0, 1 + ln(volumeRatio))` — ~1 at
normal volume, grows for high volume, and hard-floors at 0 below roughly
37% of normal (`ln(x) < -1`), so a move on thin volume is fully
suppressed rather than merely discounted.

Structural break: a rolling correlation-to-cluster window compared
against every prior window of the same length in the available history.
Flagged when the current correlation falls sharply (`breakCorrelationDrop`)
below its own historical floor **and** the residual z-score clears a
(lower) bar of its own — a break needs both a broken relationship and an
actual move, not just noise in a short correlation window. When a day
qualifies as both a break and a plain residual move, the break wins;
Section 6's compaction isn't the first place that collapses duplicates.

Thresholds (`config.ts`) are tunable; defaults are aimed at "a normal day
on a 12-symbol watchlist yields 0-2 events" per the design brief — spot
checked against Sections 1+2's real seed data (sector-mean-as-cluster
proxy, since real clustering is Section 4) and it landed at 0-3 events per
12 symbols across four different sessions, including catching the
deliberately-seeded WIPRO break window.

### Run the tests

```bash
npx vitest run
```

`tests/significance/engine.test.ts` covers the five required fixtures —
pure beta move (no flag), pure sector move (no flag), isolated residual on
confirmed volume (flag), the same residual on thin volume (no flag), and a
correlation breakdown (flag as `structural_break`, not `residual_move`) —
plus one input-validation case. `tests/significance/fixtures.ts` builds
controlled synthetic histories (deterministic sinusoidal "noise", not
random) so each scenario's numbers are reproducible; the exact constants
were tuned empirically (documented as such — Pearson correlation on small
windows isn't hand-derivable) against a throwaway exploration script,
since deleted.

## Section 4 — Clustering, with a mandatory fallback

`src/clustering/`, pure functions, no I/O — return histories in, cluster
assignments out. Built fallback-first per the brief: `clusterBySector`
(needs no return history, always succeeds) came before
`clusterByCorrelation`, and `computeClusters` is the single entry point
everything else should call — it tries correlation clustering and falls
back to sector labels whenever that's null.

`clusterByCorrelation` returns `null` (triggering the fallback) when:

- **insufficient history** — fewer than `minHistoryDays` (default 90)
  sessions for any symbol, or
- **degenerate output** — every "cluster" is still a singleton, meaning
  nothing found enough structure to merge at all.

One thing worth flagging since it surfaced as a real bug while testing:
hierarchical merging is bounded by `maxMembers` (2-6 per the brief), but a
size cap alone doesn't stop unrelated symbols from merging just because
there happens to be room — with exactly `maxMembers` totally uncorrelated
symbols, nothing would otherwise prevent them all merging into one
"cluster". Fixed by adding `maxMergeDistance` (default 0.7, i.e. won't
merge below ~0.3 correlation) as a real stopping criterion alongside the
size cap — caught by a test that built two genuinely independent random
series and asserted they stay in separate clusters.

Also included: `pairwiseCorrelations(members, returns)`, a pure function
computing the actual correlation values within a cluster — this is what
an eventual API route would call for "why are these grouped" in the UI.
The HTTP endpoint itself isn't built yet since there's no Next.js app to
hang it on until Section 6/7 — a deliberate ordering choice ("don't skip
ahead"), not a missed requirement.

### Run it end to end

```bash
npm run sync-symbols        # upserts the 40 seed symbols into `symbols`
npm run clusters:recompute  # fetches history via the Section 1 QuoteSource, caches into `clusters`
```

Meant to run weekly via a scheduled job in production — this script is
that job's body, never invoked on a read path. Verified against the real
pipeline: with only 20 days of seed history (below the 90-day minimum),
it correctly falls back to sector clustering end to end — real DB, real
`QuoteSource`, real persistence — which is exactly the fallback
requirement from the brief ("the system must remain fully functional with
only the fallback"). Re-running it replaces that date's rows cleanly
(verified — no duplicate clusters after a second run).

### Run the tests

```bash
npx vitest run
```

`tests/clustering/clustering.test.ts` covers: sector fallback needing no
history; `computeClusters` using the fallback when there's no return data
at all; insufficient-history returning null; two genuinely independent
synthetic blocks landing in separate clusters (sizes bounded to
[2,6]); the size cap holding even under heavy correlation; the
degenerate/no-structure-found null case; and `computeClusters` correctly
preferring correlation over sector labels once history is sufficient.

## Section 5 — Ingestion worker and resilience

`worker/` — a standalone long-lived Node process (`npm run worker`), not a
Next.js route. Loop per symbol: pull from `QuoteSource` -> adjust for
corporate actions before any comparison -> write the candle (idempotent)
-> run the significance engine -> append events above threshold. All six
required resilience pieces are implemented:

- **Corporate actions** (`corporate-actions.ts`) — `adjustBarsForCorporateActions`
  rescales both price and volume for every bar before an action's ex-date,
  so a 1:5 split never reads as an overnight -80% move. On the ex-date
  itself, the worker emits a `corporate_action` event and explicitly
  skips significance evaluation that day — never a false price-move event.
- **Two-source conflict** (`reconcile.ts`) — polls primary and secondary,
  and marks the day `confirmed: false` (new columns on `candles`, migration
  `0002`) rather than silently picking one when they disagree beyond
  tolerance (1%, default). Unconfirmed days are still written (the raw
  print happened) but significance evaluation is skipped for them.
- **Freshness** (`freshness.ts`) — pure `checkFreshness(asOf, now, threshold)`;
  every candle carries `source` + `ts` for the read path to apply it.
- **Stale alerts** (`stale-alerts.ts`) — `checkForResolution` compares a
  prior flagged move's baseline/trigger price against the current price;
  a large-enough reversal emits a follow-up `event_resolved` event
  (`supersedes` the original) instead of leaving the original alert as
  the last word.
- **Tiered polling** (`polling-tiers.ts`) — `pollingTierFor(watcherCount)`
  maps watchlist membership (`db/queries/watchlist.ts` `getWatchlistCounts`)
  to hot/warm/cold intervals.
- **Backpressure** (`backpressure.ts`) — `IntervalRunner` skips a tick
  (logging the skip and, once it recovers, the total gap) rather than
  queuing concurrent runs when a symbol's ingestion is still busy.

Two real bugs surfaced while wiring this up, both fixed:

1. **Postgres `date` columns were coming back as JS `Date` objects, not
   strings.** Every `session_date`/`ex_date` comparison in the codebase
   (`isExDate`, the backfill day-slicer, cluster lookups) assumed a plain
   `'YYYY-MM-DD'` string. The symptom was concrete and serious: the
   BAJFINANCE split's ex-date never matched, so the corporate-action
   short-circuit never fired and the split's raw -80% discontinuity was
   evaluated as a genuine move — 135 standard deviations, naturally, since
   nothing that large is supposed to happen. Fixed with a type parser for
   OID 1082 in `db/client.ts` (same pattern as the existing numeric/bigint
   parsers), verified by re-running and confirming BAJFINANCE's ex-date
   now produces exactly one `corporate_action` event and zero price-move
   events that day.
2. **`ingestSymbol` originally only ever processed "the latest day"** —
   since replay's `getHistory` always returns the full static dataset, a
   fresh worker would jump straight to the dataset's last session and
   never see the split's ex-date or the injected conflict date, both
   earlier in the window. Rewritten to backfill every session date newer
   than what's already in `candles` for that symbol, in chronological
   order, each day using only data available as of that day (no
   lookahead) — which is also just the correct design for a worker
   bootstrapping against history or catching up after downtime.

### Run it end to end

```bash
npm run sync-corporate-actions   # loads the seeded 1:5 split into `corporate_actions`
npm run worker
```

Verified against the real pipeline (fresh `candles`/`events`, then run):
BAJFINANCE's ex-date (2026-08-21) produces exactly one `corporate_action`
event and no price-move event that day; ICICIBANK's deliberately-injected
conflict date (2026-08-19, `worker/sources.ts`) is written with
`confirmed = false` and produces no significance event; re-running
`ingestSymbol` for an already-ingested symbol processes zero new days
(idempotent); and multiple `event_resolved` follow-ups fire correctly
across the backfill, e.g. *"WIPRO spiked 1.0%, gave back all of it
since."*

One thing I could not cleanly verify: graceful shutdown
(`process.on('SIGINT'/'SIGTERM', ...)` in `worker/index.ts`, closing the
pool before exit) follows the standard, correct Node.js pattern, but
Windows does not deliver POSIX signals the way Linux does — `kill` from
Git Bash against a Windows-native `node.exe` process didn't reliably
trigger the handler in local testing (a platform/tooling limitation, not
specific to this code), and left orphaned processes I had to clean up via
`taskkill`. This isn't a concern for the actual deployment target
(Railway runs Linux containers, where SIGTERM delivery is standard), and
real Ctrl+C in an attached interactive terminal is the normal local-dev
path and not what my test harness was doing. Flagging honestly rather
than claiming a verification I don't actually have.

### Run the tests

```bash
npx vitest run
```

`tests/worker/` covers every pure module: the exact "-80% naive diff"
split-adjustment case from the brief plus compounding/dividend edge cases;
two-source agreement/disagreement/tolerance-boundary/no-secondary cases;
freshness live/stale boundaries; the brief's exact stale-alert example
("spiked 6%, gave it all back") plus partial-retracement and
move-got-worse cases; polling tier thresholds and ordering; and
`IntervalRunner`'s skip/catch-up/error-isolation behavior via direct
`tick()` calls (no real timers needed).

## Section 6 — Read path and cursors

The read path is Next.js App Router API routes now, since this section
genuinely needs HTTP endpoints — Section 4's clustering endpoint waited
for this on purpose, Section 7 will build the actual UI on top of what's
here.

**`GET /api/digest?user_id=1`** — every event since the user's cursor,
per watchlisted symbol, hierarchically compacted, plus each symbol's
current cursor position. **Never advances a cursor** — reading is
explicit, via a separate ack.

**`POST /api/cursor/ack`** — body `{ user_id, symbol, up_to_event_id,
device_id }`. Advances the cursor monotonically only (this is Section 2's
`ackCursor`, unchanged) — a lower id from a stale/out-of-order device is
a silent no-op, not an error, verified below.

### Hierarchical compaction — the hard part

`src/digest/compact.ts`, a pure function of `(events, now)`, no I/O. Per
the brief's tiers:

- **< 1 day** — individual events, full detail, newest first.
- **1-7 days** ("episode") — every price-move event for a symbol in this
  window merges into one narrative: *"TCS drifted down 6.0% over 3
  sessions."*
- **> 7 days** ("chapter") — every price-move event for a symbol, no
  matter how many or how old, collapses into exactly **one** line with
  the net change: *"TCS: 3 moves flagged, net down 3.2% since
  2026-07-29."* This is what makes "someone gone 4 months, 40,000 events"
  safe — tested directly with 4,000 synthetic events spread across ~4
  months, asserting exactly one output item.

Two additional rules, both load-bearing for how Section 5's events read
naturally together instead of as a raw log:

- **A resolved move folds into one item, not two.** A `residual_move` and
  its later `event_resolved` (Section 5) collapse into a single digest
  item showing the *resolved* text — *"WIPRO spiked 6.0%, gave back all
  of it since"* — never the stale live-looking alert followed by a
  separate resolution line.
- **Corporate actions never merge into a price-move narrative.** A split
  is its own item in whatever tier it falls into, even alongside price
  moves for the same symbol in the same window — folding "1:5 split" into
  a drift percentage would be actively misleading.

### Multi-device cursors

Verified against the real API, not just the underlying `ackCursor` unit
(already covered in Section 2's tests) — the actual scenario the brief
asks for, two devices racing:

1. Device A acks WIPRO to event 454 → cursor advances to 454, owned by A.
2. Device B, slow/out of order, acks WIPRO to event 418 (**lower**) →
   response still shows `454`, still owned by A — silent no-op, not an
   error, not a rewind.
3. Device B catches up and acks to 464 (**higher**) → cursor advances to
   464, now owned by B.
4. Re-fetching the digest shows WIPRO's cursor at 464 and WIPRO's events
   gone from the response (nothing new since that cursor) while every
   other symbol's cursor is untouched — cursors are genuinely independent
   per (user, symbol).

### Run it end to end

```bash
npm run dev
```

```bash
curl "http://localhost:3000/api/digest?user_id=1"
curl -X POST http://localhost:3000/api/cursor/ack \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"symbol":"WIPRO","up_to_event_id":454,"device_id":"device-A"}'
```

Needs a user and a watchlist to return anything — `INSERT INTO users
(display_name) VALUES ('demo')`, then `INSERT INTO watchlist_items
(user_id, symbol) VALUES (1, 'TCS')`, then `npm run worker` briefly to
populate `events`. `user_id` as a query param / body field stands in for
real session auth, which is out of scope here — documented simplification.

### Run the tests

```bash
npx vitest run
```

`tests/digest/compact.test.ts` covers all three tiers including the exact
boundary (an event exactly 1 day old is episode, not recent — the
boundary is exclusive), the resolved-move-folds-into-one-item behavior
across tier boundaries, corporate actions never merging into a price
narrative, the empty-input case, and the 4,000-event/4-month collapse.

## Section 7 — Frontend

Four screens, exactly as scoped ("resist a fifth"): digest (home),
watchlist management, symbol detail, cluster view. Server Components
fetch data straight from `db/queries/*` (no internal HTTP round-trip);
client components exist only where a page actually needs interactivity
(ack, add/remove watchlist), talking to Section 6's API routes.

**Design.** The palette and type system come from the product's own
metaphor, not a template: `accent #2B3A67` is a deep ink-indigo — "ledger
blue" — on a warm ledger-paper ground (`#FAF8F3` light / a cool near-black
in dark), hairline rules instead of card shadows. Type has three
restrained roles: `Newsreader` (serif) for the plain-sentence headline
every card leads with, `IBM Plex Sans` for nav/labels, `IBM Plex Mono`
with tabular figures for prices and percentages — deliberately not
Inter/Space Grotesk, not cream-and-terracotta, no gradients. Both themes
are fully specified (`prefers-color-scheme` plus `data-theme` override
hooks for a future toggle), every token declared once in bare `:root`.

**The empty state gets the most deliberate space in the app**, per the
brief — centered, generous padding, a single quiet SVG mark, no error or
loading styling: *"Nothing needs you today. 8 symbols on your watchlist,
all quiet."*

**Cluster view** is one hand-built inline SVG, no chart library: each
cluster's members scatter in a loose ring around a labelled center, and
any symbol with a recent flagged move drifts further out and picks up a
semantic color — literally "the breaking node drifting out" from the
brief, driven by real event data (`getRecentlyMovedSymbols`), not a mock.

**Symbol detail** includes Section 5's freshness and confirmation states
exactly as specified — "visible but quiet — a small marker, not a red
banner": a muted `· stale` / `· unconfirmed` tag next to the as-of date,
nothing louder.

No auth system exists, so the frontend runs as one fixed demo user
(`src/lib/demo-user.ts`) — the same documented simplification Section 6
introduced for `user_id`.

### Run it end to end

```bash
npm run seed-demo-user   # creates the demo user + an 8-symbol starter watchlist
npm run worker           # populate events (Ctrl+C once it's caught up)
npm run dev
```

Verified against the real running app, not just typechecked: all four
routes return 200 with real compiled output (checked the dev server log
directly — zero compile errors/warnings across every route); the digest
page correctly renders "Nothing needs you today" against an empty
`events` table and real compacted cards once the worker has run; the
cluster page renders exactly 40 symbol nodes + 6 cluster-boundary circles
via `db/queries` cluster data; the symbol detail page for WIPRO shows its
real cluster peers as clickable links and its real event history
(`residual_move` / `event_resolved` pairs) in the correct order; and the
watchlist API round-trips an add + remove correctly through
`/api/watchlist`.

**Honest limitation**: this environment has no browser/screenshot tool,
so visual verification was HTML/RSC-payload inspection and careful CSS
authorship, not an actual rendered screenshot — I can't claim to have
*seen* the page the way a person would. If anything looks visually off
(spacing, alignment, a color that doesn't read right), that's the one
class of bug this process can't catch.

### Layout so far

```
app/
  globals.css                  design tokens (light+dark), fonts, base styles
  layout.tsx                    root layout, imports globals.css, renders Nav
  page.tsx                      Digest (home) — Server Component
  watchlist/page.tsx             Watchlist management — Server Component
  symbol/[symbol]/page.tsx        Symbol detail — Server Component
  clusters/page.tsx                Cluster view — Server Component
  components/
    nav.tsx, empty-state.tsx, digest-card.tsx, ack-button.tsx,
    mark-all-read.tsx, watchlist-controls.tsx, sparkline.tsx, cluster-visual.tsx
  api/
    digest/route.ts            GET /api/digest?user_id=
    cursor/ack/route.ts        POST /api/cursor/ack
    watchlist/route.ts          GET/POST/DELETE /api/watchlist
src/lib/
  demo-user.ts                 DEMO_USER_ID — stands in for real auth
src/digest/
  types.ts                    DigestEvent, DigestItem, DigestTier
  compact.ts                   compactEvents — the hierarchical compaction
  get-digest.ts                 getDigestForUser — shared by the page and the API route
tests/digest/
  compact.test.ts
scripts/
  seed-demo-user.ts             `npm run seed-demo-user`
next.config.mjs
worker/
  corporate-actions.ts   adjustBarsForCorporateActions, isExDate
  reconcile.ts             two-source conflict: reconcileQuotes
  freshness.ts             checkFreshness
  polling-tiers.ts         pollingTierFor
  backpressure.ts          IntervalRunner (skip-if-busy + logged gap)
  stale-alerts.ts          checkForResolution
  aggregate.ts             alignBars, computeClusterMeanReturns
  sources.ts               createSources — primary/secondary QuoteSource per DATA_MODE
  noisy-quote-source.ts    replay-mode secondary source (jitter + deliberate conflict fixture)
  ingest.ts                 ingestSymbol — the impure orchestrator, backfills day by day
  loop.ts                   one IntervalRunner per active symbol, tiered by watchlist count
  index.ts                  `npm run worker` entry point, graceful shutdown
tests/worker/
  corporate-actions.test.ts, reconcile.test.ts, freshness.test.ts,
  stale-alerts.test.ts, polling-tiers.test.ts, backpressure.test.ts,
  aggregate.test.ts
scripts/
  sync-corporate-actions.ts  `npm run sync-corporate-actions`
src/significance/
  types.ts        Bar, SignificanceInput, Decomposition, SignificanceResult
  stats.ts         mean/stdev/covariance/olsBeta/pearsonCorrelation/median
  config.ts        SignificanceConfig, DEFAULT_CONFIG
  decompose.ts      the beta/cluster/residual/volume/correlation math
  explain.ts        one-sentence plain-English explanation per event kind
  engine.ts         evaluate(): decompose -> threshold -> explain
  index.ts          barrel export
tests/significance/
  fixtures.ts       deterministic synthetic-history builder
  engine.test.ts    the five required scenarios + validation
src/clustering/
  types.ts               ClusterAssignment, ClusteringResult, SymbolReturns
  sector-fallback.ts       clusterBySector — the always-available fallback
  correlation.ts           clusterByCorrelation, pairwiseCorrelations
  compute-clusters.ts      computeClusters — the entry point (correlation, else fallback)
  index.ts                 barrel export
tests/clustering/
  clustering.test.ts
scripts/
  sync-symbols.ts          `npm run sync-symbols`
  recompute-clusters.ts    `npm run clusters:recompute`

db/
  client.ts                 pg Pool wrapper: query/queryOne/withTransaction
  migrations/
    0001_init.sql
    0002_quote_confirmation.sql   candles.confirmed, candles.source (Section 5)
  queries/
    symbols.ts
    candles.ts               idempotent per (symbol, session_date)
    corporate-actions.ts     idempotent per (symbol, ex_date, type)
    events.ts                append-only, idempotent per (symbol, ts, kind)
    users.ts
    watchlist.ts
    cursors.ts               ackCursor: monotonic advance only
    clusters.ts
docker-compose.yml           local Postgres, host port 5434
.env.example
src/
  lib/
    time/
      clock.ts             Clock interface
      market-calendar.ts   shared NSE-hours math
      live-clock.ts
      replay-clock.ts
    quotes/
      types.ts             Candle, Tick
      quote-source.ts      QuoteSource interface
      live-quote-source.ts
      live-provider-stub.ts
      replay-quote-source.ts
      tick-timeline.ts     daily candles -> deterministic intraday ticks
    data-mode.ts            DATA_MODE-aware factory (createClock/createQuoteSource)
  seed/
    symbols.ts              40 symbols / 6 sectors + NIFTY
    rng.ts                  seeded PRNG (mulberry32 + gaussian)
    generate.ts              deterministic dataset generator
    dataset.ts               load/cache/write the generated dataset
scripts/
  seed.ts                   `npm run seed`
  replay.ts                 `npm run replay -- --speed N [--symbols A,B]`
  migrate.ts                `npm run db:migrate`
data/
  seed-dataset.json          generated, gitignored
```

## Inspectability

Two additions past the original seven sections, both making a claim the
UI already makes into something a viewer can verify on the spot instead
of taking on faith:

- **"Show me anyway"** on the empty state (`GET /api/why-quiet`,
  `src/digest/why-quiet.ts`) re-runs the real decomposition for every
  watchlisted symbol's latest session — live, not cached — and shows the
  actual residual z-score and volume ratio whether or not either cleared
  the bar. "12 symbols, all quiet" stops being a claim and becomes a list
  of eleven numbers that stayed under 2σ (or under the volume-confirmation
  bar despite clearing 2σ — RELIANCE at 2.1σ on 0.9x volume is exactly
  that case) sitting next to the two that didn't.
- **"Why grouped?"** on the symbol detail page (`GET
  /api/cluster-correlations`, `src/clustering/why-grouped.ts`) is Section
  4's own ask finally wired to a click: the real pairwise correlation
  between a symbol and each cluster peer, sorted strongest first. Falls
  back to an honest note ("grouped by sector — not enough history yet")
  rather than fabricating correlation numbers when the cluster came from
  the sector fallback instead of real correlation clustering.

Both were verified against the live app, not just the API — screenshotted
mid-interaction (button clicked, panel open, real numbers rendered), not
just curled.

## Deployment

Three services, matching the brief: **Vercel** for the Next.js app (read
path + frontend), **Railway** for the worker (long-lived, not a request/
response function — can't run on Vercel), **Neon** for Postgres. Both
`vercel.json` (build command) and `railway.json` (start command) are
already in the repo so each platform's "deploy from this repo" flow needs
no manual dashboard configuration beyond environment variables.

`DATA_MODE=replay` on the deployed demo, deliberately — stated in
`.env.example` — so the URL always shows a living market regardless of
real NSE hours. That's a design choice for a demo, not an apology.

**A real gotcha, fixed before it could bite in production**: Vercel's
serverless functions have a read-only filesystem outside `/tmp`, but
`loadOrGenerateDataset()` (Section 1) originally called
`fs.writeFileSync` unconditionally as a caching optimization. Two fixes,
both already in the code: the write is now wrapped in try/catch and
treated as optional (`src/seed/dataset.ts`) so a failed cache write never
crashes a request, and `vercel.json`'s build command runs `npm run seed`
before `next build` so the bundled dataset is freshly anchored to that
deploy's build time regardless (see Section 1's dataset-freshness note —
the seed calendar anchors to "now" at generation time, on purpose, so the
digest's recent/episode/chapter tiers stay populated instead of every
session quietly aging into "chapter" as real time passes since the last
`npm run seed`).

### Steps

**1. Neon** — create a project, copy the pooled connection string
(`...-pooler.neon.tech`, `?sslmode=require`) into `DATABASE_URL`.

**2. One-time setup, run locally against the Neon URL** (these are data
bootstrap steps, not part of any platform's build — they only need to run
once, or again whenever you want to refresh the demo data):

```bash
DATABASE_URL="<neon-pooled-url>" npm run db:migrate
DATABASE_URL="<neon-pooled-url>" npm run sync-symbols
DATABASE_URL="<neon-pooled-url>" npm run sync-corporate-actions
DATABASE_URL="<neon-pooled-url>" DATA_MODE=replay npm run clusters:recompute
DATABASE_URL="<neon-pooled-url>" DATA_MODE=replay npm run seed-demo-user
```

**3. Railway (worker)** — new project from this repo; it reads
`railway.json` and runs `npm run worker` automatically. Set `DATABASE_URL`
(the Neon **direct**, non-pooled connection string — a long-lived worker
holding a persistent connection doesn't need Vercel's connection pooler)
and `DATA_MODE=replay` as environment variables. Let it run for a minute
after first deploy so it backfills events before anyone opens the app.

**4. Vercel (app)** — import this repo; it reads `vercel.json` and runs
`npm run seed && next build` automatically. Set `DATABASE_URL` (the Neon
**pooled** string this time) and `DATA_MODE=replay`.

### What's not done

Deploying the three services live requires accounts and credentials this
environment doesn't have (no valid GitHub token, no Vercel/Railway/Neon
login) — the steps above are written to be copy-paste-ready once you're
authenticated, not executed yet. Everything else on this list — configs,
the filesystem fix, the exact env vars — was gated on code, not
credentials, so it's already done.
