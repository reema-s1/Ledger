import { decompose } from './decompose';
import { buildExplanation } from './explain';
import { DEFAULT_CONFIG, type SignificanceConfig } from './config';
import type { SignificanceInput, SignificanceResult } from './types';

/**
 * Runs the full pipeline (decompose -> threshold -> explain) for one
 * symbol's most recent bar. Returns null when nothing clears the bar —
 * most days, for most symbols, that's the expected result. This is the
 * only exported entry point client code should call; `decompose` and
 * `buildExplanation` are exposed separately mainly for testing.
 */
export function evaluate(
  input: SignificanceInput,
  config: SignificanceConfig = DEFAULT_CONFIG,
  clusterLabel = 'its cluster',
): SignificanceResult | null {
  const d = decompose(input, config);

  const meetsBreak = d.isStructuralBreak && Math.abs(d.residualZ) >= config.breakResidualZGate;
  const meetsResidual =
    Math.abs(d.residualZ) >= config.residualZGate && d.volumeWeightedZ >= config.significanceThreshold;

  if (!meetsBreak && !meetsResidual) return null;

  // A structural break is the more specific, more important story — if a
  // day qualifies as both, the break wins and the plain residual move
  // isn't separately reported (compaction happens here, not just later
  // in Section 6).
  const kind = meetsBreak ? 'structural_break' : 'residual_move';
  const significance = meetsBreak ? Math.abs(d.residualZ) * Math.max(1, d.volumeWeightedZ) : d.volumeWeightedZ;

  const sessionDate = input.symbolBars[input.symbolBars.length - 1]!.sessionDate;
  const explanation = buildExplanation(kind, input.symbol, d, clusterLabel);

  return { symbol: input.symbol, sessionDate, kind, significance, explanation, decomposition: d };
}
