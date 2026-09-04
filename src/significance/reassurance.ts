/**
 * Reassurance is a separate, lower-priority check that only ever runs
 * after the real significance engine (engine.ts) has already looked at
 * the same decomposition and stayed silent. It never changes what
 * qualifies as significant — significanceZGate, significanceThreshold,
 * breakResidualZGate are all untouched by this file, and this module
 * never calls appendEvent for anything the real engine would have
 * flagged (callers are expected to only reach this after `evaluate()`
 * returned null, same decomposition, no re-computation of thresholds).
 *
 * The gap this closes: a move can be large in absolute terms (the kind
 * that grabs a beginner's attention) while being fully explained by what
 * the market did — correctly producing no alert, since it isn't
 * specific to this stock. Without this, a beginner who saw "TCS down 4%"
 * somewhere else opens the app, sees nothing, and can't tell "ignore it"
 * from "the app missed it."
 */

import type { Decomposition } from './types';

export interface ReassuranceConfig {
  /** Absolute observed-return magnitude that would grab a beginner's attention. */
  noticeThreshold: number;
  /** |residualZ| must stay under this — well under the real significance bar, not just under it. */
  residualZCeiling: number;
  /** Fraction of the observed move that beta*index alone must account for, same direction. */
  marketExplainedFraction: number;
}

// residualZCeiling (1.0) is deliberately well under DEFAULT_CONFIG.residualZGate
// (2.0) from ./config.ts — "well under your existing significance bar" per the
// spec, not a duplicate/competing threshold for the same line.
export const DEFAULT_REASSURANCE_CONFIG: ReassuranceConfig = {
  noticeThreshold: 0.03,
  residualZCeiling: 1.0,
  marketExplainedFraction: 0.6,
};

export interface ReassuranceResult {
  symbol: string;
  sessionDate: string;
  observedReturn: number;
  indexReturn: number;
  explanation: string;
}

/**
 * `d` is the same Decomposition `evaluate()` already computed and
 * discarded when it returned null — pass it straight through, don't
 * recompute. Requires the move to be both large and specifically
 * market-driven (not just "residual happens to be low," which could
 * also mean a sector-wide move with a flat market — that's not what the
 * reassurance message claims).
 */
export function checkReassurance(
  symbol: string,
  sessionDate: string,
  d: Decomposition,
  config: ReassuranceConfig = DEFAULT_REASSURANCE_CONFIG,
): ReassuranceResult | null {
  if (Math.abs(d.observedReturn) < config.noticeThreshold) return null;
  if (Math.abs(d.residualZ) >= config.residualZCeiling) return null;

  const marketComponent = d.beta * d.indexReturn;
  if (d.observedReturn === 0) return null;
  const sameSign = Math.sign(marketComponent) === Math.sign(d.observedReturn);
  const explainedFraction = Math.abs(marketComponent) / Math.abs(d.observedReturn);
  if (!sameSign || explainedFraction < config.marketExplainedFraction) return null;

  const symbolDir = d.observedReturn >= 0 ? 'up' : 'down';
  const indexDir = d.indexReturn >= 0 ? 'rose' : 'fell';
  const explanation =
    `${symbol} is ${symbolDir} ${Math.abs(d.observedReturn * 100).toFixed(1)}%. So is the market — ` +
    `Nifty ${indexDir} ${Math.abs(d.indexReturn * 100).toFixed(1)}% today. This isn't specific to ${symbol}.`;

  return { symbol, sessionDate, observedReturn: d.observedReturn, indexReturn: d.indexReturn, explanation };
}
