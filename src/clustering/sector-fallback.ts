import type { ClusterAssignment, ClusteringResult } from './types';

export interface SectorInput {
  symbol: string;
  sector: string;
}

/**
 * The fallback clustering: one cluster per static sector label. Always
 * succeeds, needs no return history. This is what the system runs on
 * when there isn't enough data for correlation clustering yet, and it's
 * also the thing correlation clustering's output gets compared against
 * to detect degenerate results — build and verify this path first, the
 * rest of the pipeline should work end to end on sector labels alone.
 */
export function clusterBySector(symbols: SectorInput[]): ClusteringResult {
  const bySector = new Map<string, string[]>();
  for (const s of symbols) {
    const arr = bySector.get(s.sector) ?? [];
    arr.push(s.symbol);
    bySector.set(s.sector, arr);
  }

  const clusters: ClusterAssignment[] = [...bySector.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sector, members]) => ({
      clusterId: `sector:${sector}`,
      members: [...members].sort(),
      method: 'sector' as const,
    }));

  const clusterOf = new Map<string, string>();
  for (const c of clusters) {
    for (const m of c.members) clusterOf.set(m, c.clusterId);
  }

  return { clusters, clusterOf };
}
