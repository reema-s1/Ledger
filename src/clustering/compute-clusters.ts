import { clusterBySector, type SectorInput } from './sector-fallback';
import { clusterByCorrelation, DEFAULT_CORRELATION_OPTIONS, type CorrelationClusteringOptions } from './correlation';
import type { ClusteringResult, SymbolReturns } from './types';

export interface ComputeClustersInput {
  symbols: SectorInput[];
  /** Return history per symbol; omit or leave short to force the sector fallback. */
  returns: SymbolReturns[];
  options?: CorrelationClusteringOptions;
}

/**
 * The entry point the rest of the app should use. Tries correlation
 * clustering; falls back to static sector labels on insufficient history
 * or a degenerate result. The fallback path alone must be enough to run
 * the whole product — this function is what makes that true no matter
 * what correlation clustering does.
 */
export function computeClusters(input: ComputeClustersInput): ClusteringResult {
  const correlationResult = clusterByCorrelation(
    input.returns,
    input.options ?? DEFAULT_CORRELATION_OPTIONS,
  );
  if (correlationResult) return correlationResult;
  return clusterBySector(input.symbols);
}
