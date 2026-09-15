# Ledger

Most watchlists show you the current price and leave you to work out what
changed. Ledger shows you **what changed since you last looked** — and
only the changes that actually mean something.

**Live demo:** [ledger-diff.vercel.app](https://ledger-diff.vercel.app) · click **Try as Guest** — no sign-up, you get a ready-made watchlist and a short guided tour.

![Landing screen](docs/screenshots/landing.png)

## The two ideas

**1. A bookmark, not a snapshot.** Everything that happens to a stock is
written to a permanent, append-only log. You hold a bookmark per stock
saying how far you've read. "What's new" is simply everything after your
bookmark. Marking something seen moves the bookmark forward — and since
bookmarks only ever move forward, your phone and laptop can never disagree
about what you've already read.

**2. "Moved" isn't the same as "mattered".** If the whole market falls 2%
and your stock falls 2%, nothing happened to *your stock*. Ledger subtracts
what the market and the stock's peer group already explain, and only flags
what's left over — and only when that leftover is unusual *for this
particular stock*, confirmed by trading volume. Most days nothing clears
the bar, and that's the product working.

## How it fits together

```mermaid
flowchart LR
    Y["Yahoo Finance<br/>real NSE prices"]

    subgraph ingest["Daily ingest · GitHub Actions, 17:00 IST"]
        B["Backfill new sessions"]
        S["Significance engine<br/>market + peer group removed"]
        R["Grade past alerts"]
        C["Recompute clusters<br/>Sundays"]
    end

    subgraph db["Postgres · Neon"]
        E[("Event log<br/>append-only")]
        K[("Candles")]
        U[("Read bookmarks<br/>per user, per stock")]
        G[("Clusters")]
    end

    subgraph app["Next.js app · Vercel"]
        P["Digest · Watchlist · Clusters<br/>Playback · System · Symbol"]
        A["Ask the log"]
    end

    Y --> B --> K
    B --> S --> E
    R --> E
    C --> G
    E --> P
    K --> P
    G --> P
    U <--> P
    E --> A
    P --> Browser(("You"))
    A --> Browser

    O["OpenRouter + Google News<br/>optional, off by default"] -.-> A
    W["Live worker<br/>on demand only"] -.-> K
```

Every stock is ingested and scored **once**, no matter how many people
watch it. The only thing that grows per user is a few tiny bookmark rows —
so adding users barely touches the cost of running it.

**How a price becomes a card:** new day's candle → subtract the market's
and the peer group's move → compare the leftover to this stock's own
normal range (a z-score) → check volume backs it up → if it clears the bar,
write one event with a plain-English sentence attached → it shows up in
your digest until you mark it seen.

## What's in it

### Digest — "What's new"
![The digest](docs/screenshots/digest.png)

- Every card leads with a **sentence**, not a ticker and a percentage.
  **Simple** mode keeps it plain; **Detailed** shows the real numbers.
- Four always-visible metrics per card (volume, move vs. peers, z-score,
  signal type), and a **breakdown** you can read in English or Hindi —
  only the words are translated, never the numbers.
- Grouped by recency — **Today**, **This week**, **Earlier**. Being away
  four months gives you one line per stock, not thousands of events.
- **Mark seen** is a real bookmark update on the server, not a checkbox.
- Old alerts get **graded afterwards** — "flagged 12 days ago, fully
  reverted since" — plus a running score of how past alerts held up.
- When nothing's flagged, **Show me anyway** runs the real math live and
  shows how close each stock came, so "all quiet" is provable, not claimed.
- **Find possible explanation** (optional) searches real, dated news for a
  flagged move and summarizes only what those articles say — always
  labeled *unverified*, with the source link.

### Ask the log
![Ask the log](docs/screenshots/ask-the-log.png)

Ask "why is my portfolio red today?" and get an answer built from the real
event log — every sentence traces back to a stored event, with source
links underneath. Optionally (`ENABLE_ASK_LOG_LLM=1`), an LLM helps
*understand* the question and *rephrase* the answer — but it never decides
what the facts are, and a rephrase is thrown away if it contains any number
or stock that wasn't in the original answer.

### Watchlist
![Watchlist](docs/screenshots/watchlist.png)

- **Search to add** by ticker or company name — "tata" finds Tata Power.
- Per stock: price, today's move (highlighted when it genuinely cleared the
  bar, not just when it's red), a chart, volume, and a price range labeled
  by how much history is actually loaded.
- The chart's **dots** mark days a real move was flagged; the **dotted
  line** is your bookmark, and the line after it only turns color when
  something significant happened since.
- **Personal reminders** — "tell me if this moves more than 2%" — shown in
  the top-right bell on every page, styled separately so they never look
  like the engine's own judgment.
- Add and remove both have **undo**.

### Clusters
![Correlation clusters](docs/screenshots/clusters.png)

Stocks grouped by how they **actually move together** over the past 90
sessions — not by sector labels. Each group lists its members by how far
they've drifted from the group today, and **Why grouped?** shows the real
correlation numbers. Falls back to sector grouping when there isn't enough
history yet.

### Playback
![Playback](docs/screenshots/playback.png)

Rewind to any past day and see exactly what the digest and clusters looked
like — rebuilt live from the event log, not a recording. Buttons to step a
day forward or jump straight to the next real flagged move.

### Also
- **Symbol page** — a stock's own events, its cluster, and an honest data
  status: fresh, stale, unavailable, or failed a cross-check — with a
  heartbeat dot that stops pulsing when the feed goes quiet, and a separate
  low-liquidity tag on thin-volume days. Staleness counts only
  **market-open hours**, so a Friday close isn't "3 days stale" on Monday.
- **System page** — the real polling tier per stock, every price
  disagreement ever caught, and each stock's latest ingestion outcome.
- **Guided tour**, light/dark theme, and stock splits handled correctly
  (a real 5:1 KOTAKBANK split doesn't show up as an 80% crash).

## Data, honestly

| | Status |
|---|---|
| Historical prices | **Real** — ~220 NSE sessions for 39 stocks + NIFTY, from Yahoo Finance |
| Daily updates | **Real** — a GitHub Action pulls each new session after the close |
| Stock splits | **Real** — KOTAKBANK's 5:1 split on 2026-01-14 is in the data and handled |
| Price cross-check | **Logic real, second source isn't** — no free independent NSE source exists, so it's checked against a jittered copy (plus one planted disagreement to catch) |
| Live, second-by-second polling | **Built, not running in production** — see below |

**Why ingestion runs daily, not live.** The app ships with a live worker
that polls every 5s–5min. Left running 24/7 it billed continuously for a
market that's closed most hours, and kept the free-tier database from ever
sleeping. A once-a-day job lands every session's real close about 90
minutes after the bell for free. The live worker still works — run
`npm run worker` locally, or redeploy it from `railway.json` for a window
that genuinely needs live ticks.

**Where an LLM is used.** Only in two optional, off-by-default features
(news explanation, Ask the log assist) — and never to decide what's
significant, never to predict prices, and never as the only source of an
answer. Clustering and significance are plain, inspectable statistics on
purpose: a confidently wrong answer about *why your money moved* is worse
than an honest "nothing cleared the bar."

## Known limitations

- **NSE holidays aren't modeled** — only Mon–Fri, 09:15–15:30 IST.
- **Login is a stub** — passwords are hashed, but not to production
  standards (no per-user salt, no rate limiting). It exists so two tabs can
  share one account and show bookmark sync.
- **Z-scores are relative to each stock's own recent history**, so they
  rank what deserves attention — they aren't comparable volatility figures
  across stocks.
- **One ingestion process at a time.** Every write is idempotent, so a
  second one wouldn't corrupt anything, but scaling to thousands of stocks
  means splitting stocks across workers.

## Tech

Next.js (App Router, TypeScript) · Postgres on Neon, plain SQL, no ORM ·
Vercel · GitHub Actions · Vitest (181 tests, no database needed:
`npx vitest run`) · driver.js for the tour.

The full technical write-up — schema, the significance math, clustering,
every failure mode and scaling path — is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Run it locally

```bash
npm install && cp .env.example .env
docker compose up -d db && npm run db:migrate
npm run seed && npm run sync-symbols && npm run sync-corporate-actions \
  && npm run clusters:recompute && npm run seed-demo-user
npm run backfill    # ingests every session in one pass
npm run dev
```

Real price history is committed, so this uses real data out of the box.
Optional features and flags are listed in `.env.example`; setup notes and
troubleshooting are in [`LOCAL.md`](LOCAL.md).
