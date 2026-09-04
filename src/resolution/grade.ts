/**
 * Retrospective grading of a past flagged event: did the move it flagged
 * hold, partially fade, or fully revert, by the time this runs? Pure
 * function — baseline/trigger/current prices in, a three-way outcome and
 * a plain sentence out. Generalizes Section 5's binary stale-alert check
 * (worker/stale-alerts.ts, which only asks "did it fully revert") into a
 * full grade, but doesn't replace or touch that mechanism — this is a
 * separate, additive kind ('resolution'), not a rewrite of
 * 'event_resolved'. No significance thresholds live here; this never
 * decides what counts as an alert, only what happened to one afterward.
 */

export type ResolutionOutcome = 'held' | 'partially_reverted' | 'reverted';

export interface ResolutionGrade {
  outcome: ResolutionOutcome;
  /** 1 = the full original move is still there, 0 = fully reverted, negative = overshot back past baseline, >1 = continued further. */
  retainedFraction: number;
  explanation: string;
}

const HELD_THRESHOLD = 0.75;
const REVERTED_THRESHOLD = 0.25;

export function gradeResolution(
  symbol: string,
  kindLabel: 'structural break' | 'unusual move',
  baselineClose: number,
  triggerClose: number,
  currentClose: number,
): ResolutionGrade {
  const originalMove = triggerClose - baselineClose;
  if (originalMove === 0) {
    return { outcome: 'held', retainedFraction: 1, explanation: `${symbol}: no net move at the time to grade.` };
  }

  const currentMoveFromBaseline = currentClose - baselineClose;
  const retainedFraction = currentMoveFromBaseline / originalMove;

  let outcome: ResolutionOutcome;
  if (retainedFraction >= HELD_THRESHOLD) outcome = 'held';
  else if (retainedFraction >= REVERTED_THRESHOLD) outcome = 'partially_reverted';
  else outcome = 'reverted';

  const currentPct = (currentMoveFromBaseline / baselineClose) * 100;
  const dir = currentPct >= 0 ? 'up' : 'down';

  let explanation: string;
  if (outcome === 'held') {
    explanation = `Flagged for ${kindLabel} — still diverged, ${dir} ${Math.abs(currentPct).toFixed(1)}% since.`;
  } else if (outcome === 'reverted') {
    explanation = `Flagged for ${kindLabel} — fully reverted since.`;
  } else {
    explanation = `Flagged for ${kindLabel} — partially reverted, now ${dir} ${Math.abs(currentPct).toFixed(1)}% since.`;
  }

  return { outcome, retainedFraction, explanation };
}
