import type { Bar } from '../src/significance/types';
import type { RawBar } from './corporate-actions';

/**
 * `reference` narrowed to the sessions `other` also has, order preserved.
 *
 * Used to put a stock's series onto the index's calendar *before*
 * aligning, because alignBars (below) refuses any date the index lacks —
 * correct for a peer, but fatal for the index, which every stock needs.
 * Yahoo's NIFTY series silently omits single days (26 Jun 2026, in a 3mo
 * window where every stock has it), and that one gap made alignment fail
 * for all 39 stocks on every live ingest until the day scrolled out of the
 * lookback — prices landed, significance was never evaluated. Dropping the
 * few sessions the index can't vouch for costs one slightly longer return
 * interval in the rolling window; refusing them cost the whole engine.
 */
export function restrictToSharedDates(reference: RawBar[], other: RawBar[]): RawBar[] {
  const dates = new Set(other.map((b) => b.sessionDate));
  return reference.filter((b) => dates.has(b.sessionDate));
}

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
