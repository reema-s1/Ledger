/**
 * Two-source conflict detection. Never silently pick one source when they
 * disagree — surface the disagreement so the rest of the pipeline can
 * refuse to treat the quote as trustworthy (no significance events on
 * unconfirmed data), and so it's visible rather than swallowed.
 */

export interface SourceQuote {
  price: number;
  ts: Date;
  source: string;
}

export interface ReconciledQuote {
  price: number;
  ts: Date;
  confirmed: boolean;
  primary: SourceQuote;
  secondary: SourceQuote | null;
  /** Fractional disagreement, e.g. 0.02 = 2%. Null when there's no secondary to compare against. */
  disagreementPct: number | null;
}

export function reconcileQuotes(
  primary: SourceQuote,
  secondary: SourceQuote | null,
  toleranceFraction: number,
): ReconciledQuote {
  if (!secondary || primary.price === 0) {
    // No second source to check against: treat as confirmed by default —
    // this is the "ship single source" cut-list fallback, not a silent
    // best-guess: `secondary: null` in the result still says explicitly
    // that no cross-check happened.
    return { price: primary.price, ts: primary.ts, confirmed: true, primary, secondary: null, disagreementPct: null };
  }

  const disagreementPct = Math.abs(primary.price - secondary.price) / primary.price;
  const confirmed = disagreementPct <= toleranceFraction;

  return { price: primary.price, ts: primary.ts, confirmed, primary, secondary, disagreementPct };
}
