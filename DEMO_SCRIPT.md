# Demo script

A ~3-minute spoken walkthrough. Written to be read close to verbatim, but
say it in your own words — the point is the beats and the order, not the
exact sentences. Each beat says what to click and what to say.

Before you start: make sure `npm run dev` is running, the demo watchlist
has events in it (re-run the worker if the digest looks empty — see
`LOCAL.md`), and you're on `/`.

---

### 1. Open on the digest (10s)

**Say:**
> "Most watchlists show you current state and make you work out what
> changed. Ledger shows the diff. This is what opening it looks like."

**Do:** Just let the page sit there a second. Point at the three
sections — Today, This week, Earlier — without clicking yet.

---

### 2. The plain-sentence cards (20s)

**Say:**
> "Every card leads with a sentence, not a number. This one" — *(point
> at a Today card)* — "isn't 'TCS -1.8%.' It's explaining itself: down
> this much, while the market did this, while its cluster did that,
> and here's how many standard deviations that residual actually is,
> confirmed by volume. If it can't be explained in one sentence, the
> engine doesn't emit it at all."

**Do:** Click **Seen** on one card. It updates immediately.

**Say:**
> "That's a real cursor ack, not a local checkbox — it just told the
> server 'I've read this,' monotonically. Two devices can't un-read
> each other."

---

### 3. The empty state — the best "prove it" moment (30s)

**Do:** Click **Mark all read**. The whole digest clears.

**Say:**
> "This is the screen most days are supposed to look like — and it got
> the most design attention of any screen in the app, on purpose.
> 'Nothing needs you today' isn't a fallback state, it's the product
> working."

**Do:** Click **Show me anyway**.

**Say:**
> "And it's not a claim you have to take on faith. This just re-ran the
> real decomposition, live, for every symbol on the watchlist, and
> shows you the actual residual — whether or not it cleared the bar.
> This one's at 2.1 standard deviations but stayed quiet, because the
> volume wasn't there to confirm it. That's the significance engine's
> whole logic, inspectable in one click."

---

### 4. The hard resilience cases — BAJFINANCE (45s)

**Do:** Navigate to `/symbol/BAJFINANCE`.

**Say:**
> "This stock did a 1:5 split partway through the history. Naively,
> that reads as an overnight -80% crash — every naive watchlist would
> scream about it."

**Do:** Scroll to the event list, point at the `corporate action` line.

**Say:**
> "Ledger adjusts for it before the number ever reaches the
> significance engine. It shows up as exactly what it is —" *(read the
> line)* — "'executed a 1:5 split today' — and the moves right before
> and after it are normal-sized, not -80%."

**Do:** Point at an `event resolved` line.

**Say:**
> "And this one — the stock spiked, got flagged, and then gave it all
> back. Most systems would leave that alert sitting there looking live
> forever. Ledger emits a follow-up: 'dropped 4.4%, gave back all of it
> since.' The stale alert resolves itself instead of lying to you."

---

### 5. Structural break, not price move — the actual thesis (30s)

**Do:** Navigate to `/clusters`.

**Say:**
> "This is the other half of the idea. A 12-stock watchlist is usually
> three or four correlated bets, not twelve independent ones. The
> meaningful event isn't 'a stock moved' — it's 'this stock tracked its
> group for months and just stopped.'"

**Do:** Point at a cluster with a colored/drifting node, if one's
visible (amber = flagged move, red = structural break).

**Say:**
> "This node drifting out of its group is exactly that — a stock that
> broke from a cluster it used to track."

**Do:** Navigate to any symbol in that cluster, click **Why grouped?**

**Say:**
> "And that grouping isn't a label — it's real correlation, computed
> over the actual return history, one click from proof."

---

### 6. Close (15s)

**Say:**
> "Under the hood: append-only event log, per-user read cursors,
> Postgres, a standalone worker that handles corporate actions,
> two-source conflict detection, stale-alert resolution, tiered
> polling, backpressure — all separately tested. But the pitch is the
> two ideas: the diff is the data model, not a UI feature, and
> unexplained residual beats price-move threshold every time."

---

## If something goes wrong live

- **Digest looks empty and "Show me anyway" has nothing** — the worker
  backfill didn't run. Say "let me show you this on a page that already
  has data" and jump straight to `/symbol/BAJFINANCE` instead — that
  data doesn't depend on the digest's cursor state.
- **Clusters page says "grouped by sector"** — still a legitimate,
  honest answer (the brief's own mandatory fallback), just say so: "this
  is the fallback path — real correlation clustering needs 90+ sessions
  of history, and the sector fallback is what keeps the product fully
  functional without it."
- **Someone asks "why not just alert on any 5% move"** — that's the
  thesis in one line: "because a 5% move the whole sector made isn't
  news. The unexplained residual is."
