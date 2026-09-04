/** Small, dependency-free stats helpers. Pure functions only. */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
}

export function stdev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

export function covariance(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) sum += (xs[i]! - mx) * (ys[i]! - my);
  return sum / (xs.length - 1);
}

/** OLS beta of y on x: cov(x,y) / var(x). 0 if x has no variance (degenerate, not undefined). */
export function olsBeta(x: number[], y: number[]): number {
  const vx = variance(x);
  if (vx === 0) return 0;
  return covariance(x, y) / vx;
}

/** 0 if either series has no variance, rather than NaN. */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const sx = stdev(xs);
  const sy = stdev(ys);
  if (sx === 0 || sy === 0) return 0;
  return covariance(xs, ys) / (sx * sy);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Daily simple returns from a close-price series, oldest first. Length = closes.length - 1. */
export function returnsFromCloses(closes: number[]): number[] {
  const rs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rs.push(closes[i]! / closes[i - 1]! - 1);
  }
  return rs;
}

/** Up to the last `n` elements, or all of them if there are fewer than `n`. */
export function lastN<T>(xs: T[], n: number): T[] {
  return n >= xs.length ? xs : xs.slice(xs.length - n);
}
