/**
 * A flagged move that fully (or mostly) reverses shouldn't just sit there
 * looking current when someone opens the app later — "spiked 6%, gave it
 * all back by close" instead of silently leaving the original alert as
 * the last word. Pure function: the original move's baseline/trigger
 * prices in, a resolution verdict and follow-up explanation out.
 */

export interface OriginalMove {
  /** Close price immediately before the flagged move. */
  baselineClose: number;
  /** Close price that triggered the original flag. */
  triggerClose: number;
}

export interface ResolutionCheck {
  resolved: boolean;
  currentClose: number;
  /** 1 = fully back to baseline, 0 = no retracement, negative = the move got worse. */
  retracedFraction: number;
  explanation: string | null;
}

export function checkForResolution(
  symbol: string,
  original: OriginalMove,
  currentClose: number,
  retraceThreshold = 0.75,
): ResolutionCheck {
  const originalMove = original.triggerClose - original.baselineClose;
  if (originalMove === 0) {
    return { resolved: false, currentClose, retracedFraction: 0, explanation: null };
  }

  const currentMoveFromBaseline = currentClose - original.baselineClose;
  const remainingFraction = currentMoveFromBaseline / originalMove;
  const retracedFraction = 1 - remainingFraction;

  if (retracedFraction < retraceThreshold) {
    return { resolved: false, currentClose, retracedFraction, explanation: null };
  }

  const originalPct = (originalMove / original.baselineClose) * 100;
  const verb = originalPct >= 0 ? 'spiked' : 'dropped';
  const howMuchBack = retracedFraction >= 0.99 ? 'all of it' : `${(retracedFraction * 100).toFixed(0)}%`;

  return {
    resolved: true,
    currentClose,
    retracedFraction,
    explanation: `${symbol} ${verb} ${Math.abs(originalPct).toFixed(1)}%, gave back ${howMuchBack} since.`,
  };
}
