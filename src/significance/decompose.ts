import { stdev, median, olsBeta, pearsonCorrelation, returnsFromCloses, lastN } from './stats';
import type { SignificanceInput, Decomposition } from './types';
import type { SignificanceConfig } from './config';

/**
 * observed_return = beta * index_return + cluster_excess + residual, where
 * cluster_excess = cluster_return - beta * index_return. Substituting:
 *
 *   residual = observed_return - beta*index_return - (cluster_return - beta*index_return)
 *            = observed_return - cluster_return
 *
 * beta cancels algebraically — by design, not a bug. What's left is
 * exactly "how this stock did relative to its own cluster's mean today",
 * which is the quantity that matters (a move the whole cluster made
 * together isn't news; residual vs. beta*index is still doing work in the
 * decomposition record and the explanation text, just not in the number
 * that gets z-scored).
 */
export function decompose(input: SignificanceInput, config: SignificanceConfig): Decomposition {
  const { symbolBars, indexBars, clusterReturns } = input;

  if (symbolBars.length < 2) {
    throw new Error(`decompose: need at least 2 bars, got ${symbolBars.length}`);
  }
  if (indexBars.length !== symbolBars.length) {
    throw new Error(
      `decompose: indexBars (${indexBars.length}) must be index-aligned with symbolBars (${symbolBars.length})`,
    );
  }
  if (clusterReturns.length !== symbolBars.length - 1) {
    throw new Error(
      `decompose: clusterReturns length (${clusterReturns.length}) must equal symbolBars.length - 1 (${symbolBars.length - 1})`,
    );
  }

  const symbolReturns = returnsFromCloses(symbolBars.map((b) => b.close));
  const indexReturns = returnsFromCloses(indexBars.map((b) => b.close));

  const todayIdx = symbolReturns.length - 1;
  const observedReturn = symbolReturns[todayIdx]!;
  const indexReturn = indexReturns[todayIdx]!;
  const clusterReturn = clusterReturns[todayIdx]!;

  // --- beta: trailing regression, strictly before today ------------------
  const histSymbolReturns = symbolReturns.slice(0, todayIdx);
  const histIndexReturns = indexReturns.slice(0, todayIdx);
  const betaSymbol = lastN(histSymbolReturns, config.betaWindow);
  const betaIndex = lastN(histIndexReturns, config.betaWindow);
  const beta = olsBeta(betaIndex, betaSymbol);

  const clusterExcess = clusterReturn - beta * indexReturn;
  const residual = observedReturn - clusterReturn; // see header comment

  // --- residual volatility: trailing (symbol - cluster), before today ----
  const histClusterReturns = clusterReturns.slice(0, todayIdx);
  const histResiduals = histSymbolReturns.map((r, i) => r - histClusterReturns[i]!);
  const residualWindow = lastN(histResiduals, config.residualStdevWindow);
  const residualStdevValue = stdev(residualWindow);
  const residualZ = residualStdevValue === 0 ? 0 : residual / residualStdevValue;

  // --- volume confirmation -------------------------------------------------
  const volumes = symbolBars.map((b) => b.volume);
  const todayVolume = volumes[volumes.length - 1]!;
  const histVolumes = lastN(volumes.slice(0, -1), config.volumeMedianWindow);
  const medianVolume = median(histVolumes);
  const volumeRatio = medianVolume === 0 ? (todayVolume === 0 ? 1 : Infinity) : todayVolume / medianVolume;
  // 1 at "normal" volume (ratio 1, ln=0), grows for high volume, drops to
  // 0 (fully suppressing the score) below roughly e^-1 (~37%) of normal —
  // "a move on no volume is noise" needs a hard floor, not just a discount.
  const volumeWeight = Math.max(0, 1 + Math.log(volumeRatio));
  const volumeWeightedZ = Math.abs(residualZ) * volumeWeight;

  // --- structural break: rolling correlation vs its own historical range -
  const symbolReturnsThruToday = symbolReturns.slice(0, todayIdx + 1);
  const clusterReturnsThruToday = clusterReturns.slice(0, todayIdx + 1);
  const w = config.correlationWindow;

  let correlationToCluster = 0;
  let correlationHistoricalMin = 0;
  let correlationHistoricalMax = 0;
  let isStructuralBreak = false;

  if (symbolReturnsThruToday.length >= w) {
    correlationToCluster = pearsonCorrelation(
      lastN(symbolReturnsThruToday, w),
      lastN(clusterReturnsThruToday, w),
    );

    const historicalCorrs: number[] = [];
    // Every prior window of length w ending strictly before today.
    for (let end = w - 1; end < symbolReturnsThruToday.length - 1; end++) {
      const s = symbolReturnsThruToday.slice(end - w + 1, end + 1);
      const c = clusterReturnsThruToday.slice(end - w + 1, end + 1);
      historicalCorrs.push(pearsonCorrelation(s, c));
    }

    if (historicalCorrs.length > 0) {
      correlationHistoricalMin = Math.min(...historicalCorrs);
      correlationHistoricalMax = Math.max(...historicalCorrs);
      isStructuralBreak = correlationToCluster < correlationHistoricalMin - config.breakCorrelationDrop;
    } else {
      // Not enough history to establish a range yet — can't call it a
      // break, just unknown.
      correlationHistoricalMin = correlationToCluster;
      correlationHistoricalMax = correlationToCluster;
    }
  }

  return {
    observedReturn,
    beta,
    indexReturn,
    clusterReturn,
    clusterExcess,
    residual,
    residualZ,
    volumeRatio,
    volumeWeightedZ,
    correlationToCluster,
    correlationHistoricalMin,
    correlationHistoricalMax,
    isStructuralBreak,
  };
}
