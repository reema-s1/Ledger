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
