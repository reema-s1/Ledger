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
