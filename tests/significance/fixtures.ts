import type { Bar, SignificanceInput } from '../../src/significance/types';
import type { SignificanceConfig } from '../../src/significance/config';

/** Deterministic, non-constant "noise" — no randomness, just enough variance for stats to be well-defined. */
export function noise(i: number, amplitude: number, phase = 0): number {
  return amplitude * Math.sin(i * 0.73 + phase);
}

export function sessionDates(n: number): string[] {
  const dates: string[] = [];
  let d = new Date('2026-01-05T00:00:00Z'); // a Monday
  while (dates.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return dates;
}

function closesFromReturns(startPrice: number, returns: number[]): number[] {
  const closes = [startPrice];
  for (const r of returns) closes.push(closes[closes.length - 1]! * (1 + r));
  return closes;
}

function toBars(dates: string[], closes: number[], volumes: number[]): Bar[] {
  return dates.map((sessionDate, i) => ({ sessionDate, close: closes[i]!, volume: volumes[i]! }));
}

/** Small windows so fixtures stay short and readable; still exercises the exact same logic paths. */
export const TEST_CONFIG: SignificanceConfig = {
  betaWindow: 20,
  residualStdevWindow: 20,
  volumeMedianWindow: 10,
  correlationWindow: 10,
  residualZGate: 2.0,
  significanceThreshold: 2.5,
  breakResidualZGate: 1.5,
  breakCorrelationDrop: 0.25,
};

export interface ScenarioOptions {
  days: number;
  /** Index daily returns for every day (length `days`). */
  indexReturns: number[];
  /** Sector/cluster beta to the index, applied for every calm historical day. */
  clusterBeta: number;
  /** Cluster's own idiosyncratic noise amplitude (keeps cluster non-degenerate). */
  clusterNoiseAmplitude: number;
  /** Symbol's idiosyncratic noise amplitude on top of the cluster, historically. */
  symbolNoiseAmplitude: number;
  /** Override today's (last day) cluster return; symbol still tracks the (overridden) cluster by default. */
  todayClusterReturnOverride?: number;
  /** Override today's (last day) symbol return; defaults to tracking the cluster. */
  todaySymbolReturnOverride?: number;
  /** Volume ratio for today relative to a stable historical baseline. */
  todayVolumeRatio?: number;
  /** Optional per-day symbol-return overrides for the most recent `n` days (decoupling window), keyed by offset from the end (0 = today). */
  recentSymbolReturnOverrides?: Record<number, number>;
}

/**
 * Builds a SignificanceInput where, by default, the symbol tracks its
 * cluster tightly every day (low, stable residual — a calm history) so
 * scenario-specific overrides on top of it produce clean, predictable
 * z-scores and correlations instead of fighting against random noise.
 */
export function buildScenario(opts: ScenarioOptions): SignificanceInput {
  const { days, indexReturns, clusterBeta, clusterNoiseAmplitude, symbolNoiseAmplitude } = opts;
  if (indexReturns.length !== days) throw new Error('indexReturns must have length `days`');

  const clusterReturns = indexReturns.map((r, i) => clusterBeta * r + noise(i, clusterNoiseAmplitude, 1));
  const lastIdx = days - 1;
  if (opts.todayClusterReturnOverride !== undefined) {
    clusterReturns[lastIdx] = opts.todayClusterReturnOverride;
  }
  const symbolReturns = clusterReturns.map((cr, i) => cr + noise(i, symbolNoiseAmplitude, 2));

  if (opts.todaySymbolReturnOverride !== undefined) {
    symbolReturns[lastIdx] = opts.todaySymbolReturnOverride;
  }
  if (opts.recentSymbolReturnOverrides) {
    for (const [offsetStr, value] of Object.entries(opts.recentSymbolReturnOverrides)) {
      const offset = Number(offsetStr);
      symbolReturns[lastIdx - offset] = value;
    }
  }

  const dates = sessionDates(days + 1); // +1: closes need one more point than returns
  const indexCloses = closesFromReturns(24000, indexReturns);
  const clusterCloses = closesFromReturns(1000, clusterReturns); // cluster has no independent "close" in the real schema; kept only for symmetry, unused by decompose
  void clusterCloses;
  const symbolCloses = closesFromReturns(1000, symbolReturns);

  const stableVolume = 1_000_000;
  const volumes = new Array(days + 1).fill(stableVolume);
  if (opts.todayVolumeRatio !== undefined) {
    volumes[volumes.length - 1] = Math.round(stableVolume * opts.todayVolumeRatio);
  }

  return {
    symbol: 'TEST',
    symbolBars: toBars(dates, symbolCloses, volumes),
    indexBars: toBars(dates, indexCloses, volumes),
    clusterReturns,
  };
}
