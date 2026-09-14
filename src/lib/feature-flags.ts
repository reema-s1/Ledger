/**
 * One flag, one file, checked in exactly two places (app/playback/page.tsx,
 * app/api/playback/route.ts) plus the nav link — Playback is explicitly
 * the highest-risk addition this late, so it ships off by default and
 * can be cut without touching any other route by leaving this env var
 * unset.
 */
export function isPlaybackEnabled(): boolean {
  return process.env.ENABLE_PLAYBACK === '1';
}

/**
 * Reassurance cards only render when a real reassurance-kind event landed
 * in the last 24h (src/digest/reassurance-cards.ts) — genuine but
 * unreliable for a scheduled recording, since the seed data's dates drift
 * with "now". When set, get-digest.ts substitutes one hardcoded example
 * card whenever there are zero real ones, purely for demo/recording
 * purposes. Off by default; never affects real judging traffic unless
 * deliberately enabled.
 */
export function isDemoReassuranceForced(): boolean {
  return process.env.DEMO_FORCE_REASSURANCE === '1';
}

/**
 * "Find possible explanation" (llm-addition.md) — an on-demand, search-
 * grounded LLM lookup for a flagged significance event, kept entirely
 * separate from the deterministic significance engine. The newest and
 * least-tested part of the system: ships off by default, one flag cuts
 * it (button, API route, and DB writes) without touching anything else.
 */
export function isExplanationLookupEnabled(): boolean {
  return process.env.ENABLE_EXPLANATION_LOOKUP === '1';
}

/**
 * Ask the log's two LLM-assisted layers (src/lib/ask-log.ts) — parsing a
 * question the deterministic regex parser couldn't make sense of, and
 * rephrasing the deterministic answer into more natural prose (verified
 * against the original before it's ever shown — see isGrounded). Off by
 * default for the same reason as isExplanationLookupEnabled: the
 * deterministic path is the trusted core, this only ever augments it,
 * and one flag cuts both layers cleanly without touching the retrieval
 * or answer-composition code underneath.
 */
export function isAskLogLLMEnabled(): boolean {
  return process.env.ENABLE_ASK_LOG_LLM === '1';
}
