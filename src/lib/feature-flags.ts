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
