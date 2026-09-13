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

---

## 2026-09-14 — Item 19: personal watch-level threshold (real backend storage, not localStorage)

**What changed.** A manual, personal "notify me if this moves more than X%" reminder, entirely separate from the significance engine's own judgment. This explicitly needed real server-side storage per the brief's own instruction not to invent local-only storage that would silently diverge from multi-device sync (the whole product's cursor model exists specifically to avoid that class of bug) — so a small additive migration was added rather than skipped or faked:

- `db/migrations/0007_watch_thresholds.sql` — new table `watch_thresholds (user_id, symbol, threshold_pct)`, its own table rather than a column on `watchlist_items`, since removing a symbol from the watchlist shouldn't force a decision about a personal preference unrelated to tracking it.
- `db/queries/watch-thresholds.ts`, `app/api/watch-threshold/route.ts` (POST to set, DELETE to clear) — same shape/conventions as the existing `/api/watchlist` route.
- `app/watchlist/rows.ts` now also reads the user's thresholds and computes `thresholdExceeded` (today's raw `|1D change|` vs. the personal threshold) as a fact entirely separate from `daySignificant` (the engine's own bar) — never conflated.
- `app/components/personal-threshold.tsx` — a small inline editable badge, deliberately styled with its own icon (🔔) and a neutral accent color, never `--up`/`--down`/`--unconfirmed` (the significance engine's own palette), so it can never read as part of the engine's judgment.

**Backend surfaces touched:** one new table, one new route — both additive, no existing route/schema/computation changed. Verified end-to-end: set a real threshold via the API, confirmed it rendered on the watchlist table, cleared it, confirmed it reverted.

---

## 2026-09-14 — Item 20: verified, not built — no intraday data exists

**Checked before building anything**, per the item's own explicit instruction: `candles` (`db/migrations/0001_init.sql`) has `PRIMARY KEY (symbol, session_date)` — one row per symbol per trading day. There is no intraday tick storage anywhere in this schema. Per the item's explicit fallback instruction, fine-grained intraday scrubbing is **not built**; the existing day-level Playback control (extended with the Reset/Advance/Next-event/Exit controls above, items 12/13) is left as the real, honest granularity this data actually supports.

---

## 2026-09-14 — Items 21, 22, 23: undo, real source timestamps, rule-based multilingual explanations

**Item 21 — explicit undo on watchlist add/remove.** `app/components/undo-toast.tsx` (new) shows a dismissible "Added/Removed X. Undo" toast after either action. Undoing an add deletes the row outright — a freshly-added symbol has no cursor or personal threshold yet, so there's nothing to restore. Undoing a remove re-adds the row; since `removeFromWatchlist` never touches `read_cursors`/`watch_thresholds` (verified in `db/queries/watchlist.ts` — confirmed on the main branch too, this session), the symbol's exact prior cursor position and any personal threshold are simply still there, untouched — a real restore, not a fabricated one. No backend change.

**Item 22 — real source timestamp attached; verbatim quote explicitly not implemented.** `src/lib/explanation-lookup.ts`'s `NewsItem.pubDate` was already fetched from Google News RSS but discarded before reaching the UI — now threaded through as `sourcePublishedAt` on `ExplanationLookupResult`, persisted (`db/migrations/0008_event_explanation_timestamp.sql` adds `event_explanations.source_published_at`), and rendered next to the source link. The other half of the item — a verbatim quoted line from inside the article — is **not implemented**: the RSS feed only ever provides a title/link/pubDate, never the article's body text, so the LLM grounding step (`buildGroundingMessages`) never sees anything to quote from. Fetching and parsing arbitrary news sites' full HTML to extract a real quote would be a materially larger, more fragile change (unreliable per-vendor parsing, a real candidate for "stop and ask before a new external dependency") — flagged honestly here rather than fabricating a "quote" from the headline alone.

**Item 23 — multilingual explanation text, rule-based, no LLM.** `src/digest/structured-explanation.ts` now takes a `locale: 'en' | 'hi'` parameter — a fixed phrase table translates only the words around each number (labels, "up"/"down"/"flat", "market", volume phrasing); every real number (percentages, σ, volume ratio) passes through completely unchanged, verified by a dedicated test asserting the same numbers appear verbatim in both languages. `app/components/structured-explanation-block.tsx` gained an EN/हिं toggle (local component state, no persistence, no backend). Deliberately not a translation API or LLM call, per the item's explicit instruction — a fixed phrase table can't introduce its own interpretation of what a number means, which a model in principle could.

**Files:** `db/migrations/0007_watch_thresholds.sql`, `db/migrations/0008_event_explanation_timestamp.sql` (new), `db/queries/watch-thresholds.ts` (new), `app/api/watch-threshold/route.ts` (new), `app/watchlist/rows.ts`, `app/components/personal-threshold.tsx` (new), `app/components/watchlist-table.tsx`, `app/components/undo-toast.tsx` (new), `db/queries/event-explanations.ts`, `src/lib/explanation-lookup.ts`, `app/api/events/[id]/explain/route.ts`, `app/components/explain-button.tsx`, `src/digest/structured-explanation.ts`, `app/components/structured-explanation-block.tsx`, `tests/digest/structured-explanation.test.ts`.

---

## 2026-09-14 — Closing out: item 1's IA pass on the remaining screens, and a DO-NOT-IMPLEMENT compliance check

**IA audit on System and Playback — no further changes.** Digest, Watchlist, Clusters, and Symbol detail all got real restructuring above. System and Playback were audited too, deliberately concluding "no change" rather than skipping the check: System is a diagnostics/ops page (`/system`'s own copy: "how this actually runs, not just what the README claims") — its whole purpose is showing real detail to a technical reader, so the "default-visible vs. one click away" principle doesn't apply the same way it does to a consumer screen; nothing on it is a redundant label or duplicated fact. Playback already got its scripted-demo controls (items 12/13); its existing scrubber/digest/cluster layout has no redundant elements to trim.

**DO-NOT-IMPLEMENT boundaries — checked against everything built in this branch:**

- **No sentiment scoring, and nothing from news-lookup feeds back into the significance engine.** True — `src/lib/explanation-lookup.ts`'s only change this branch was adding a passthrough timestamp field; nothing about it, or any other change, touches `src/significance/` or what the engine flags.
- **No real trading/order execution wired to an alert or event.** Nothing built touches order execution — the personal threshold (item 19) is a passive display badge, not an action.
- **The LLM never assigns a confidence tier or decides significance in any new feature.** No new LLM call was added anywhere in this branch (item 23's multilingual support is explicitly a fixed phrase table, not a model call, precisely to avoid this).
- **No live push-notification system; an alert mechanism must be gated behind the existing significance bar, never a raw price/volume trigger independent of it.** Worth stating explicitly since item 19's personal threshold *is* a raw price-based trigger independent of significance — but it is not a push/notification delivery mechanism of any kind: no background job, no email/SMS/browser-push, nothing proactive. It's a badge computed at page-render time, visible only when the user is already looking at the watchlist page, exactly as item 19 itself specifies ("clearly and visually separated from the engine's own significance flagging... a manual personal reminder, not a second scoring system"). The two instructions are compatible, not in tension: item 19 authorizes a passive raw-threshold *display*; the DO-NOT-IMPLEMENT section forbids a raw-threshold *push alert*. Only the former was built.

**Final state of all 23 items:** every numbered item has either a real, tested implementation (verified against the actual backfilled real dataset, not fixtures, throughout — see each entry above) or an explicit, reasoned non-implementation logged here and, where the item's own section required it, in `PROJECT_EXPLAINED.md`'s trade-off ledger. Nothing was faked, approximated client-side, or silently skipped.

---

## 2026-09-14 — Bug found in review: `app/watchlist/rows.ts`'s cursor handling

**What was wrong.** `cursorIndex` (and the whole "since you left" marker/coloring feature, item 18) was only ever computed `if (cursor > 0)` — a symbol whose cursor is exactly `0` ("never acknowledged anything") got `cursorIndex: null`, which makes `Sparkline` treat it as `hasCursor: false` and fall back to rendering the entire line in one flat up/down color, identical to the plain pre-item-18 sparkline. Every symbol on a fresh watchlist starts at cursor `0` — so in practice the cursor marker/split-coloring never appeared for anyone who hadn't already acked something, which is exactly the state this demo's `read_cursors` table was in after earlier testing. Reported by the user as "the graphs didn't seem correct... colored fully."

**Fix.** Cursor `0` is now treated as "the cursor sits at the very start of the loaded window" (`cursorIndex = 0`), the same fallback already used for a cursor that predates the window entirely — a real, meaningful "since you left" story (since you started watching this symbol at all) rather than skipping the feature. `getEventsSince(symbol, 0)` correctly returns every event ever recorded for that symbol, so `significantSinceCursor` now reflects real history instead of defaulting to `false`.

**Why the line can still look fully colored after the fix, and that's correct, not a residual bug:** with ~220 real trading sessions of history and a demo watchlist that's never been read, most symbols genuinely have had at least one real flagged move somewhere in the visible window — so `significantSinceCursor` is honestly `true` almost everywhere right now. The gray/colored split becomes visually meaningful once a real user has actually read and acked recent events (advancing their cursor forward, shortening the "since you left" tail) — it isn't broken, it just has nothing to contrast against on a never-touched demo account.

**The dot count (event markers) was checked and is correct, not a bug:** verified directly against the real DB — e.g. TCS genuinely has 8 real flagged `residual_move`/`structural_break` events within its 130-session sparkline window, INFY has 5, ICICIBANK has 1. This is real historical density, not duplicated or misplaced markers. Left as-is pending user feedback on whether the marker density should be visually reduced (e.g. capped to the most recent few) for a cleaner look on a ~140px sparkline.

**Files:** `app/watchlist/rows.ts`.

---

## 2026-09-14 — User feedback: cluster labels and hover-zoom on the Clusters visual

**"Why are the clusters named like that?"** — `c52`, `c55`, `c56` etc. are internal merge-order counters from the hierarchical clustering algorithm (`src/clustering/correlation.ts`): every symbol starts as its own singleton `c0..c{n-1}`, and every merge creates a new `c{nextId++}`, continuing that same counter upward. Never meant to be user-facing — `app/clusters/page.tsx`'s label formatter only stripped the `sector:` prefix for the sector-fallback case and passed correlation cluster ids straight through unchanged. Fixed: `withDisplayLabels()` assigns a clean "Group 1", "Group 2"... numbering, ordered by a stable, meaningful sort (largest group first, tie-broken alphabetically by first member) instead of exposing "the 52nd merge operation" as if it meant something. Purely a display-layer fix — the underlying cluster computation and its real internal ids are untouched.

**Hover-zoom on the cluster visual.** `app/components/cluster-visual.tsx`'s SVG groups and member nodes now scale up smoothly on hover (`.cluster-hover-zoom`/`.cluster-node-hover` in `globals.css`, a `transform: scale()` with a slight overshoot easing for a "pop" feel) instead of the flat, static version. Each element sets `transform-box: fill-box; transform-origin: center` inline so it zooms around its own visual center rather than the SVG's (0,0) origin. An invisible, generously-sized hit-circle sits behind each group and each node so hovering the empty space inside the dashed ring (not just a drawn line or a 3px dot) still triggers it. Respects `prefers-reduced-motion` for free — the existing global rule zeroes every `transition-duration`, so this degrades to an instant state change rather than an unwanted animation for anyone who's asked for that. Pure CSS, no JS state, no animation library.

**Files:** `app/clusters/page.tsx`, `app/components/cluster-visual.tsx`, `app/globals.css`.
