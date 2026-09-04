/**
 * Pure types for the significance engine. No I/O anywhere in this module
 * tree — numbers in (bars, betas, cluster series), a score and a
 * plain-English explanation out. Section 5 (the ingestion worker) is the
 * only thing that calls this with real data and persists the result.
 */

export interface Bar {
  sessionDate: string;
  close: number;
  volume: number;
}

/** One symbol's own history plus everything needed to decompose today's return. */
export interface SignificanceInput {
  symbol: string;
  /** Oldest first. Must include today's bar as the last element. */
  symbolBars: Bar[];
  /** Same session dates as symbolBars, oldest first, index-aligned. */
  indexBars: Bar[];
  /**
   * Same-length, index-aligned daily returns of the symbol's cluster
   * (mean return of cluster peers, excluding the symbol itself) for every
   * session in symbolBars except the first (returns need a prior close).
   * Length is symbolBars.length - 1.
   */
  clusterReturns: number[];
}

export type EventKind = 'residual_move' | 'structural_break';

export interface Decomposition {
  observedReturn: number;
  beta: number;
  indexReturn: number;
  clusterReturn: number;
  clusterExcess: number;
  residual: number;
  residualZ: number;
  volumeRatio: number;
  volumeWeightedZ: number;
  correlationToCluster: number;
  correlationHistoricalMin: number;
  correlationHistoricalMax: number;
  isStructuralBreak: boolean;
}

export interface SignificanceResult {
  symbol: string;
  sessionDate: string;
  kind: EventKind;
  /** Always >= 0. Threshold-comparable "how much does this deserve attention". */
  significance: number;
  explanation: string;
  decomposition: Decomposition;
}
