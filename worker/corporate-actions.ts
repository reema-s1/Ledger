/**
 * Pure corporate-action adjustment. A 1:5 split reads as a ~-80%
 * overnight move in raw as-traded prices — adjust the series used for
 * comparison BEFORE it ever reaches the significance engine, so that
 * discontinuity never gets mistaken for a real move. Raw prices in the
 * `candles` table are never rewritten; adjustment happens only in the
 * in-memory series built for a given ingestion run.
 */

export interface RawBar {
  sessionDate: string;
  close: number;
  volume: number;
}

export interface CorporateAction {
  exDate: string;
  type: 'split' | 'bonus' | 'dividend';
  /** 1:ratio, e.g. 5 for a 1:5 split. Only 'split' and 'bonus' affect price/volume continuity. */
  ratio: number;
}

/**
 * Divides every close strictly before an action's ex-date by its ratio
 * and multiplies volume by the same ratio, so both series read as
 * continuous across the split instead of jumping — post-split, the same
 * rupee turnover naturally shows up as `ratio`x the share volume, so
 * volume needs the same treatment as price for volume-ratio comparisons
 * (Section 3's confirmation step) to stay meaningful across the boundary.
 * Bonus issues get the same treatment as splits; dividends don't rescale
 * price/volume history and are ignored here.
 */
export function adjustBarsForCorporateActions(bars: RawBar[], actions: CorporateAction[]): RawBar[] {
  const priceActions = actions.filter((a) => a.type === 'split' || a.type === 'bonus');
  if (priceActions.length === 0) return bars;

  return bars.map((bar) => {
    let ratioProduct = 1;
    for (const action of priceActions) {
      if (bar.sessionDate < action.exDate) ratioProduct *= action.ratio;
    }
    return {
      sessionDate: bar.sessionDate,
      close: bar.close / ratioProduct,
      volume: bar.volume * ratioProduct,
    };
  });
}

/** True if `sessionDate` is exactly the ex-date of some corporate action. */
export function isExDate(sessionDate: string, actions: CorporateAction[]): CorporateAction | null {
  return actions.find((a) => a.exDate === sessionDate) ?? null;
}
