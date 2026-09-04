import type { Decomposition, EventKind } from './types';

function describeMove(returnValue: number, flatEps = 0.001): string {
  if (Math.abs(returnValue) < flatEps) return 'flat';
  const dir = returnValue > 0 ? 'up' : 'down';
  return `${dir} ${(Math.abs(returnValue) * 100).toFixed(1)}%`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Every emitted event must be explainable in one plain-English sentence
 * built directly from the decomposition's components. If it can't be
 * explained this simply, the engine shouldn't have emitted it.
 */
export function buildExplanation(
  kind: EventKind,
  symbol: string,
  d: Decomposition,
  clusterLabel: string,
): string {
  if (kind === 'structural_break') {
    return (
      `${symbol} broke from its ${clusterLabel} cluster: 30-session correlation dropped to ` +
      `${d.correlationToCluster.toFixed(2)} from a typical ${d.correlationHistoricalMin.toFixed(2)}-` +
      `${d.correlationHistoricalMax.toFixed(2)}, alongside a ${describeMove(d.residual)} move against the group.`
    );
  }

  return (
    `${capitalize(describeMove(d.observedReturn))} while the market was ${describeMove(d.indexReturn)} ` +
    `and ${clusterLabel} was ${describeMove(d.clusterReturn)}. ` +
    `That's ${Math.abs(d.residualZ).toFixed(1)} standard deviations for this stock, ` +
    `on ${d.volumeRatio.toFixed(1)}x normal volume.`
  );
}
