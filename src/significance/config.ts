/**
 * Bumped whenever the scoring *formula* changes (a new gate, a changed
 * weighting, a different volume-confirmation curve) — not for a threshold
 * retune within the same formula. Stored on every emitted event's payload
 * so a future formula change can never silently reinterpret an old event
 * as if today's math had produced it; a stored event's significance number
 * is only ever comparable to another event carrying the same version.
 */
export const SCORING_VERSION = 'v1';

export interface SignificanceConfig {
  /** Trailing sessions used to regress the stock's return on the index. */
  betaWindow: number;
  /** Trailing sessions used to compute the residual's own volatility. */
  residualStdevWindow: number;
  /** Trailing sessions used for the median-volume baseline. */
  volumeMedianWindow: number;
  /** Sessions in the rolling correlation-to-cluster window. */
  correlationWindow: number;
  /** Minimum |residual z| for a plain residual move to even be considered. */
  residualZGate: number;
  /** Minimum volume-weighted score to actually emit a residual_move. */
  significanceThreshold: number;
  /** Minimum |residual z| for a structural break to be considered (lower than residualZGate — the correlation drop is itself strong evidence). */
  breakResidualZGate: number;
  /** How far below its own historical floor the current correlation must fall to count as "sharp". */
  breakCorrelationDrop: number;
}

// Tuned so a typical 12-symbol watchlist yields ~0-2 events on a normal
// day. If real usage shows more noise than that, raise these; if it goes
// quiet on days that should have flagged something, lower them slightly
// — but check the volume gate first, that's the more common culprit.
export const DEFAULT_CONFIG: SignificanceConfig = {
  betaWindow: 60,
  residualStdevWindow: 60,
  volumeMedianWindow: 20,
  correlationWindow: 30,
  residualZGate: 2.0,
  significanceThreshold: 2.5,
  breakResidualZGate: 1.5,
  breakCorrelationDrop: 0.25,
};
