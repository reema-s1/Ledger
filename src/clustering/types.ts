/**
 * Pure types for clustering. No I/O — a set of symbols' return histories
 * in, cluster assignments out. db/queries/clusters.ts is the only thing
 * that persists the result (cached weekly, never computed on the request
 * path).
 */

export interface ClusterAssignment {
  clusterId: string;
  members: string[];
  method: 'sector' | 'correlation';
}

export interface ClusteringResult {
  clusters: ClusterAssignment[];
  /** clusterId each symbol landed in, for O(1) lookup. */
  clusterOf: Map<string, string>;
}

export interface SymbolReturns {
  symbol: string;
  /** Daily returns, oldest first, same session dates across all symbols passed together. */
  returns: number[];
}
