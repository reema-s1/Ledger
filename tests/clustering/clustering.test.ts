import { describe, it, expect } from 'vitest';
import { clusterBySector } from '../../src/clustering/sector-fallback';
import { clusterByCorrelation } from '../../src/clustering/correlation';
import { computeClusters } from '../../src/clustering/compute-clusters';
import type { SymbolReturns } from '../../src/clustering/types';
import { seededRng, gaussian } from '../../src/seed/rng';

function noise(i: number, amplitude: number, phase = 0): number {
  return amplitude * Math.sin(i * 0.73 + phase);
}

/** A deterministic series of independent-ish gaussian draws — genuinely low
 * correlation with any other series built from a different seed, unlike
 * phase-shifted sine waves (which stay correlated at most phase offsets). */
function randomSeries(seed: string, days: number, amplitude: number): number[] {
  const rng = seededRng(seed);
  return Array.from({ length: days }, () => amplitude * gaussian(rng));
}

describe('clusterBySector (fallback path)', () => {
  it('groups symbols by their static sector label, needing no return history at all', () => {
    const symbols = [
      { symbol: 'TCS', sector: 'IT' },
      { symbol: 'INFY', sector: 'IT' },
      { symbol: 'HDFCBANK', sector: 'Banking' },
      { symbol: 'SBIN', sector: 'PSU Bank' },
    ];
    const result = clusterBySector(symbols);

    expect(result.clusters).toHaveLength(3);
    const it = result.clusters.find((c) => c.clusterId === 'sector:IT')!;
    expect(it.members).toEqual(['INFY', 'TCS']);
    expect(it.method).toBe('sector');
    expect(result.clusterOf.get('TCS')).toBe('sector:IT');
    expect(result.clusterOf.get('SBIN')).toBe('sector:PSU Bank');
  });

  it('is what computeClusters uses when there is no return history — the system must run on this alone', () => {
    const symbols = [
      { symbol: 'TCS', sector: 'IT' },
      { symbol: 'INFY', sector: 'IT' },
      { symbol: 'HDFCBANK', sector: 'Banking' },
    ];
    const result = computeClusters({ symbols, returns: [] });
    expect(result.clusters.every((c) => c.method === 'sector')).toBe(true);
  });
});

describe('clusterByCorrelation', () => {
  it('returns null (triggering fallback) when history is shorter than minHistoryDays', () => {
    const returns: SymbolReturns[] = [
      { symbol: 'A', returns: Array.from({ length: 10 }, (_, i) => noise(i, 0.01)) },
      { symbol: 'B', returns: Array.from({ length: 10 }, (_, i) => noise(i, 0.01)) },
    ];
    expect(clusterByCorrelation(returns)).toBeNull();
  });

  it('groups two genuinely correlated blocks of symbols together and keeps cluster sizes in [2,6]', () => {
    const days = 120;
    const factorA = randomSeries('factor-a', days, 0.01);
    const factorB = randomSeries('factor-b', days, 0.01); // independent seed -> ~uncorrelated with A

    const blockA: SymbolReturns[] = ['A1', 'A2', 'A3'].map((symbol, k) => ({
      symbol,
      returns: factorA.map((r, i) => r + noise(i, 0.002, k)), // tracks factorA tightly
    }));
    const blockB: SymbolReturns[] = ['B1', 'B2', 'B3'].map((symbol, k) => ({
      symbol,
      returns: factorB.map((r, i) => r + noise(i, 0.002, k + 10)), // tracks factorB tightly
    }));

    const result = clusterByCorrelation([...blockA, ...blockB], {
      minMembers: 2,
      maxMembers: 6,
      minHistoryDays: 90,
      maxMergeDistance: 0.7,
    });

    expect(result).not.toBeNull();
    for (const c of result!.clusters) {
      expect(c.members.length).toBeGreaterThanOrEqual(2);
      expect(c.members.length).toBeLessThanOrEqual(6);
      expect(c.method).toBe('correlation');
    }

    // A1/A2/A3 must all land in the same cluster, and it must not contain any B symbol.
    const clusterOfA1 = result!.clusterOf.get('A1');
    expect(result!.clusterOf.get('A2')).toBe(clusterOfA1);
    expect(result!.clusterOf.get('A3')).toBe(clusterOfA1);
    expect(result!.clusterOf.get('B1')).not.toBe(clusterOfA1);
  });

  it('caps cluster size at maxMembers even when many symbols are all highly correlated', () => {
    const days = 120;
    const factor = Array.from({ length: days }, (_, i) => noise(i, 0.01, 0));
    const returns: SymbolReturns[] = Array.from({ length: 10 }, (_, k) => ({
      symbol: `S${k}`,
      returns: factor.map((r, i) => r + noise(i, 0.001, k)), // all tightly track the same factor
    }));

    const result = clusterByCorrelation(returns, {
      minMembers: 2,
      maxMembers: 4,
      minHistoryDays: 90,
      maxMergeDistance: 0.7,
    });
    expect(result).not.toBeNull();
    for (const c of result!.clusters) {
      expect(c.members.length).toBeLessThanOrEqual(4);
    }
  });

  it('reports null (degenerate: no structure found) when clustering can never merge anything', () => {
    const days = 120;
    const returns: SymbolReturns[] = ['A', 'B'].map((symbol, k) => ({
      symbol,
      returns: Array.from({ length: days }, (_, i) => noise(i, 0.01, k * 3)),
    }));
    // maxMembers 1 makes every possible merge exceed the cap, so nothing
    // can ever merge — the "no real structure found" failure mode.
    const result = clusterByCorrelation(returns, {
      minMembers: 2,
      maxMembers: 1,
      minHistoryDays: 90,
      maxMergeDistance: 0.7,
    });
    expect(result).toBeNull();
  });
});

describe('computeClusters', () => {
  it('prefers correlation clustering over the sector fallback when history is sufficient', () => {
    const days = 120;
    const factor = Array.from({ length: days }, (_, i) => noise(i, 0.01, 0));
    const symbols = [
      { symbol: 'A1', sector: 'SectorX' },
      { symbol: 'A2', sector: 'SectorY' }, // deliberately different sector label than A1/A3
      { symbol: 'A3', sector: 'SectorZ' },
    ];
    const returns: SymbolReturns[] = symbols.map((s, k) => ({
      symbol: s.symbol,
      returns: factor.map((r, i) => r + noise(i, 0.001, k)),
    }));

    const result = computeClusters({
      symbols,
      returns,
      options: { minMembers: 2, maxMembers: 6, minHistoryDays: 90, maxMergeDistance: 0.7 },
    });
    expect(result.clusters.every((c) => c.method === 'correlation')).toBe(true);
    // All three ended up correlated despite having three different sector labels.
    expect(new Set(result.clusters.map((c) => c.clusterId)).size).toBe(1);
  });
});
