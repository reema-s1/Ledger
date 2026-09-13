/**
 * A multi-line breakdown of a decomposition already computed by the
 * significance engine (src/significance/decompose.ts) and stored on the
 * event's payload — this module does no new computation of its own, it
 * only re-presents the same numbers `buildExplanation` (explain.ts)
 * already turns into one sentence, as a short structured list instead:
 * the move itself, what the market/cluster explains, the leftover
 * residual and why it's unusual for this specific stock, and the volume
 * context. Read-path formatting, same category as compact.ts/why-quiet.ts
 * — not the scoring engine itself.
 */

import type { Decomposition } from '../significance/types';

function describeMove(returnValue: number, flatEps = 0.001): string {
  if (Math.abs(returnValue) < flatEps) return 'flat';
  const dir = returnValue > 0 ? 'up' : 'down';
  return `${dir} ${(Math.abs(returnValue) * 100).toFixed(1)}%`;
}

/**
 * The same z-score expressed in plain language instead of a Greek letter
 * — "2.4x this stock's normal daily range" is the same number as "2.4σ",
 * just spelled out for someone who doesn't already read z-scores fluently.
 */
export function plainLanguageZ(residualZ: number): string {
  const abs = Math.abs(residualZ);
  return `${abs.toFixed(1)}x this stock's normal daily range`;
}

export interface StructuredExplanationLine {
  label: string;
  text: string;
}

/**
 * 2-4 short lines, one idea each. Never more than one line references the
 * same underlying number twice — "residual" and "why it's unusual" are
 * combined into a single line (the residual size *is* the input to the
 * z-score), matching the brief's "2-4 short lines" cap rather than
 * padding out to one line per available field.
 */
export function buildStructuredExplanation(d: Decomposition, clusterLabel = 'its cluster'): StructuredExplanationLine[] {
  const lines: StructuredExplanationLine[] = [
    { label: 'This move', text: describeMove(d.observedReturn) },
    { label: 'Explained by market + cluster', text: `market ${describeMove(d.indexReturn)}, ${clusterLabel} ${describeMove(d.clusterReturn)}` },
    {
      label: 'Left over, unexplained',
      text: `${describeMove(d.residual)} — ${plainLanguageZ(d.residualZ)} (${Math.abs(d.residualZ).toFixed(1)}σ)`,
    },
    {
      label: 'Volume',
      text: d.volumeDataMissing ? 'not enough history to confirm' : `${d.volumeRatio.toFixed(1)}x normal`,
    },
  ];
  return lines;
}
