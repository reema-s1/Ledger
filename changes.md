# Changes on `experimental_frontend`

Frontend redesign pass per the brief in the branch-creation prompt. Dated
entries, most recent first. Each entry: what changed, which files, which
existing API/DB fields it relies on, and anything that would need a new
backend shape (flagged, not implemented).

No backend computation, schema, or route *logic* changes in this branch
unless explicitly noted as reusing already-computed/already-stored data
through the existing read path — see the "Backend surfaces touched"
line on each entry.

---

## 2026-09-14 — Items 2, 3, 8, 14: decomposition data threaded into the digest, four-metric row, structured breakdown

**What changed.** Previously `DigestItem` (the read path's own shape, `src/digest/types.ts`) carried only a `headline` string — the significance engine's real decomposition (residual, z-score, volume ratio, beta, structural-break flag, etc.) was already computed and stored on every event's `payload` at ingestion time, but never reached the frontend as structured data, only baked into one prose sentence. Four things followed from making that data actually reach the UI:

- `src/digest/compact.ts` now attaches `payload.decomposition` to a `DigestItem` **only** for a single real event (the "recent" tier, <1 day old, or a corporate action) — **never** for an episode/chapter item that folds several days' events into one narrative, since an aggregate decomposition across multiple days would be a fabricated number, not a real one. Covered by two new tests in `tests/digest/compact.test.ts`.
- New `src/digest/structured-explanation.ts` (pure, read-path formatting — same category as `compact.ts`/`why-quiet.ts`, not the scoring engine) turns a decomposition into 2-4 labeled lines: the move itself, what market+cluster explain, what's left over and why that's unusual for this specific stock (item 3), and the volume context. `plainLanguageZ()` is item 8: the z-score expressed as "Nx this stock's normal daily range" alongside the raw σ number, not instead of it. 5 new tests in `tests/digest/structured-explanation.test.ts`.
- New `app/components/decomposition-metrics.tsx` — the four metrics shown on every flagged card, always visible (not hidden behind the existing Simple/Detailed toggle, per item 14): Volume (Nx normal / "no baseline" when `volumeDataMissing`), Vs cluster (the real residual, signed), Z-score, and a Structural break/Residual move signal chip. Deliberately not a generic indicator (RSI etc.) — every value is something the significance engine already computes and returns, per item 2's explicit preference.
- New `app/components/structured-explanation-block.tsx` renders `structured-explanation.ts`'s lines; `app/components/digest-card.tsx` gained a per-card "Show breakdown ▾" expand toggle (item 1's default/expanded pattern) that reveals it — collapsed by default so the card's default state stays a one-glance surface, the four metrics chip row stays visible either way.

**Files:** `src/digest/types.ts`, `src/digest/compact.ts`, `src/digest/structured-explanation.ts` (new), `app/components/decomposition-metrics.tsx` (new), `app/components/structured-explanation-block.tsx` (new), `app/components/digest-card.tsx`, `tests/digest/compact.test.ts`, `tests/digest/structured-explanation.test.ts` (new).

**Backend surfaces touched:** none modified. `payload.decomposition` was already written by `worker/ingest.ts` on every `residual_move`/`structural_break` event before this branch existed (main-branch work, unrelated to this prompt) — this only reads it back through the existing `GET /api/digest` response, which already passed `payload` through unmodified (`src/digest/get-digest.ts`). No new route, no new query, no new computation. Verified against real backfilled data (`KOTAKBANK`, event id 433): decomposition round-trips through `compactEvents` correctly at the exact numbers the significance engine computed.

**Items 5, 6, 7 (scoring version, zero-not-fabricated missing evidence, reset-on-source-switch) were already true before this branch** — done in prior main-branch work this session, verified still present: `SignificanceResult.scoringVersion`, `Decomposition.volumeDataMissing` (neutral weight, not `Infinity`), and rolling-window stats recomputed fresh every ingestion cycle (no accumulated state to blend across a `DATA_MODE` switch — see `db/migrations/0005_candle_data_mode.sql`'s comment). Not re-implemented here; noted so the branch history is honest about what's actually new.

**Not yet done from item 1's full scope:** the IA audit still needs to cover Clusters, Playback, System, and the Symbol detail page individually (Digest is the only screen restructured so far).

---

## 2026-09-14 — Items 4, 9, 10, 11: four-state data quality, low-liquidity tag, heartbeat

**What changed.**

- `worker/freshness.ts` gained `classifyQuoteQuality(freshness, confirmed)`, a new pure function (item 9 explicitly calls for this) combining two already-computed, independent facts — `classifyFreshness`'s existing 3-level age classification (already per-symbol-cadence-scaled, not a fixed global timeout — item 11 was already substantially true) and the existing `confirmed` boolean from two-source reconciliation — into one 4-state `QuoteQuality`: `fresh | stale | unavailable | invalid`. `invalid` (reconciliation rejected the print) takes priority over freshness: a fresh-but-disputed number isn't "fresher" than a stale one. 5 new tests in `tests/worker/freshness.test.ts`.
- `app/components/data-quality-notice.tsx` (item 4): replaces the old generic "· stale" / "· unconfirmed" text badges on the symbol detail page with an actual sentence per state — what's wrong, since when (real age, `app/lib/format.ts`'s `formatAge`), and what it means for trusting the number. Renders nothing for `fresh` — no reassuring banner needed, keeps the default view uncluttered per item 1.
- `app/components/heartbeat-dot.tsx` (item 11's UI half): a small dot that pulses only when `fresh` — crossing the symbol's own expected refresh interval stops the pulse and changes color, which is itself the signal, not a separate label.
- `app/components/low-liquidity-tag.tsx` (item 10): its own distinct tag, shown only when today's volume ratio is below 0.6x normal (a UI presentation threshold, chosen with margin above the significance engine's own ~0.37x hard suppression floor in `decompose.ts` — not a scoring parameter, no config/schema change) — separate from the staleness notice above, since thin volume and a stale feed are different facts about a symbol.
- `app/symbol/[symbol]/page.tsx` now wires all three together, using `getRecentCandles` (existing), `explainWhyQuietForSymbols` (existing — the same read-only decomposition the "Show me anyway" feature already uses, extended here to a single symbol) — no new query, no new route.

**Files:** `worker/freshness.ts`, `tests/worker/freshness.test.ts`, `app/components/data-quality-notice.tsx` (new), `app/components/heartbeat-dot.tsx` (new), `app/components/low-liquidity-tag.tsx` (new), `app/lib/format.ts` (new — `formatPct`/`formatAge` extracted so the watchlist table redesign, item 17, can reuse them), `app/globals.css` (new `heartbeat-ping` keyframe, respects the existing `prefers-reduced-motion` rule), `app/symbol/[symbol]/page.tsx`.

**Backend surfaces touched:** `worker/freshness.ts` gained one new pure function — no existing function's behavior changed, no schema, no route. Verified against real backfilled data: `/symbol/KOTAKBANK` correctly renders "Data provider unreachable for 3d" (the real gap between the committed dataset's last real session, 2026-09-11, and today), and a direct call confirms `explainWhyQuietForSymbols(['TCS'])` returns a real `volumeRatio` (1.18, correctly below the low-liquidity threshold's trigger point) rather than a null/broken value.

**"Stale/unavailable/invalid data must never silently create a cursor advance or a new event" (item 9's explicit requirement) — already true, verified, not newly built:** cursors only ever move on an explicit client `POST /api/cursor/ack`, never from a freshness computation; `worker/ingest.ts` already skips significance evaluation entirely whenever `confirmed` is false (Section 5, pre-existing).

---

## 2026-09-14 — Item 12: explicitly NOT implemented, with reasoning

**Item 12 asked for:** snapshotting read state at session-boundary events (tab/window blur, logout, session timeout) in addition to the existing explicit "Mark seen" — but only if it can't weaken the existing guarantee that opening the app never silently advances the cursor, and explicitly said to flag it in changes.md instead of implementing it if there's a real risk of conflating "glanced at" with "reviewed."

**Decision: not implemented.** All three proposed triggers fail that test:

- **Tab/window blur** fires constantly for reasons that have nothing to do with reading a card — alt-tabbing to answer a message, a phone call, checking a second monitor. A user could open the digest, read nothing, get interrupted, and have every card silently marked seen. This is the textbook "glanced at" vs. "reviewed" conflation the item itself warned about.
- **Logout** is a more deliberate action than blur, but still doesn't imply every visible card was actually read — someone could open the app, see it's a busy day, and log out without reading anything.
- **Session timeout** is arguably the *opposite* signal from "reviewed" — it means the user *wasn't there*.

The core product guarantee (`PROJECT_EXPLAINED.md` section 2, "Idea 1") is that a cursor only ever moves on an explicit, deliberate act — "marking something 'seen' just moves your bookmark forward... it never touches the log itself" is stated as close to non-negotiable. None of the three proposed triggers meet that bar. **No code changed for this item** — the existing explicit "Mark seen"/"Mark all read" flow is unchanged.

---

## 2026-09-14 — Item 13: scripted demo scenario via Playback (reset / advance / next event / exit)

**What changed.** The existing Playback feature (`app/playback/`, `/api/playback`) already reconstructs the digest as of any historical date from the real event log, and was already "per-user isolated" by construction — it's a stateless GET keyed by a `date` query param and the requesting user's own watchlist, not a shared mutable server-side clock, so there was never a cross-user interference risk to solve. What was missing was a *scripted* way to move through it:

- `db/queries/events.ts` gained `getFlaggedEventDates(symbols)` — every distinct session date (among a watchlist's symbols) carrying a real flagged move. Plain read-only `SELECT DISTINCT`, no schema change, no new significance computation.
- `app/playback/page.tsx` now also fetches the current user's watchlist and its flagged dates, passed to `PlaybackScrubber`.
- `app/components/playback-scrubber.tsx` gained four controls: **Reset** (jump to the first ingested session), **Advance +1 day**, **Next event →** (jump straight to the next real flagged date — "inject event" reinterpreted honestly: rather than fabricate an event that didn't happen, jump to a day something real already did), and **Exit to live digest** (back to `/`).

**Files:** `db/queries/events.ts`, `app/playback/page.tsx`, `app/components/playback-scrubber.tsx`.

**Backend surfaces touched:** one new read-only query function, additive. No new route (still the same `/api/playback?date=` contract), no schema change.

**Verified against real data:** `getFlaggedEventDates` against the real demo user's 12-symbol watchlist returns 81 real distinct flagged dates (2025-10-27 through 2026-09-02) from the actual backfilled event log — not a fixture.

**Why "inject event" wasn't literal fake-event injection:** every other real/simulated distinction in this project is disclosed honestly rather than faked (see `PROJECT_EXPLAINED.md` section 5's whole table) — manufacturing a fake event for a demo button would be the one place that principle broke. Jumping to a real date with a real event serves the same demo purpose (a scripted, deterministic walkthrough that always lands on something interesting) without fabricating data.

---

## 2026-09-14 — Items 15, 16, 17, 18: peer divergence on Clusters, watchlist table redesign with sparklines/cursor markers

**Item 15 — peer-group divergence, extending Clusters rather than a parallel view.** `app/clusters/page.tsx` now calls `src/digest/why-quiet.ts`'s `explainWhyQuietForSymbols` (already existed, already used by "Show me anyway") for every clustered symbol, not just watchlisted ones, and replaces the old plain comma-separated member list with `app/components/divergence-row.tsx`: each cluster's members sorted by how far they've actually diverged from the group right now (real residual z-score, not just "was an event ever flagged"). No new computation — same decomposition, read for a wider set of symbols than before. Measured page load against the real ~39-symbol universe: ~1.2s locally, acceptable for a server-rendered page, noted here in case a production deploy needs to cache this.

**Item 16 — additional time horizons, folded into the watchlist table rather than a separate mechanism.** The brief's literal examples ("since market open," "a short intraday window") need intraday tick data this project doesn't store — only one candle per symbol per session exists (same constraint documented for item 20 below). Real, honestly-available additional horizons were added instead, as part of items 17/18's table: a fixed 1-session change (the existing "1D" column) and a real-history range window, both already meaningfully different from the cursor-based "since you last checked" without fabricating granularity that isn't there.

**Items 17 & 18 — the watchlist table redesign.** The watchlist page was previously just an add/remove management grid — no prices, no history, no chart at all. Rebuilt as a real table:

- `app/watchlist/rows.ts` (new) assembles one row per symbol from existing queries only — `getRecentCandles`, `getRecentEventsForSymbol`, `getCursorOrDefault`, `getEventsSince`, `classifyQuoteQuality` — no new query logic beyond composing what already exists.
- `app/components/sparkline.tsx` extended (backward-compatible — the symbol detail page's existing call site is unchanged) with `eventIndices` (small dots at real flagged sessions), `cursorIndex` (a dotted line at the user's real read-cursor position, falling back to the start of the loaded window when the cursor predates it), and `significantSinceCursor` (the segment after the cursor is colored by direction **only** when a real event actually cleared the bar since then — otherwise it renders muted gray, so a small insignificant dip never reads as alarming, per item 18's explicit requirement).
- `app/components/range-bar.tsx` (new) — a low/high indicator labeled by the real span of history fetched (`app/lib/format.ts`'s `formatRangeWindowLabel`, 4 new tests) — never "52W" unless the window actually covers close to a year; the shipped real dataset (~220 sessions ≈ 10-11 real months) correctly labels as "~11mo range."
- `app/components/watchlist-table.tsx` (new) replaces the old card grid, keeping the same add/remove mutation logic. The 1D-change cell gets a distinct pill/border treatment only when that day's move cleared the significance bar (`daySignificant`) — "moved" and "moved and mattered" now look different at a glance, not just by color sign.
- The old `app/components/watchlist-controls.tsx` was deleted (fully superseded, zero remaining references) rather than left as dead code.

**Files:** `app/clusters/page.tsx`, `app/components/divergence-row.tsx` (new), `app/watchlist/rows.ts` (new), `app/watchlist/page.tsx`, `app/components/watchlist-table.tsx` (new), `app/components/sparkline.tsx`, `app/components/range-bar.tsx` (new), `app/lib/format.ts`, `tests/app/format.test.ts` (new). Deleted: `app/components/watchlist-controls.tsx`.

**Backend surfaces touched:** none. Every data point above already existed behind an exported query function; this only composes them differently for one page.

**Verified against real data, not assumed:** posted a real `POST /api/cursor/ack` for MPHASIS (event 488, 2025-10-27), confirmed the watchlist table rendered "+1.2% since you left" in green (matching real later `residual_move` events for that symbol at ids 490/491/494/495/497), then reverted the ack so demo state is unchanged. Confirmed the range label renders "~11mo range" (not a fabricated "52W") and 12 real ₹ prices/volumes render correctly for the demo user's real 12-symbol watchlist.
