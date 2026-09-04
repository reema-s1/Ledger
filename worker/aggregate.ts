import type { Bar } from '../src/significance/types';
import type { RawBar } from './corporate-actions';

/**
 * Re-indexes `other` onto `reference`'s exact session dates. Returns null
 * if `other` is missing any date `reference` has — a peer or the index
 * with gappier history than the symbol being evaluated isn't safe to
 * average in silently.
 */
export function alignBars(reference: RawBar[], other: RawBar[]): Bar[] | null {
  const byDate = new Map(other.map((b) => [b.sessionDate, b]));
  const aligned: Bar[] = [];
  for (const r of reference) {
    const match = byDate.get(r.sessionDate);
    if (!match) return null;
    aligned.push({ sessionDate: r.sessionDate, close: match.close, volume: match.volume });
  }
  return aligned;
}

/**
 * Mean daily return across cluster peers, day-aligned to `symbolBars`.
 * Length = symbolBars.length - 1, matching SignificanceInput.clusterReturns.
 */
export function computeClusterMeanReturns(symbolBars: Bar[], peerBarsList: Bar[][]): number[] {
  if (peerBarsList.length === 0) return [];
  const out: number[] = [];
  for (let i = 1; i < symbolBars.length; i++) {
    let sum = 0;
    for (const peerBars of peerBarsList) {
      sum += peerBars[i]!.close / peerBars[i - 1]!.close - 1;
    }
    out.push(sum / peerBarsList.length);
  }
  return out;
}
