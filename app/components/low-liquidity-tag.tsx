/**
 * Its own distinct tag, separate from staleness/unavailability (item 10)
 * — thin volume is a different fact from a stale or unconfirmed feed: the
 * price could be perfectly fresh and confirmed, and still be one or two
 * trades' worth of volume, which is a reason to discount the move itself
 * (the significance engine already does exactly this — decompose.ts's
 * volumeWeight — this tag just surfaces the same volumeRatio to a reader
 * even on a day nothing was flagged).
 */
export function LowLiquidityTag({ volumeRatio }: { volumeRatio: number }) {
  return (
    <span
      className="tabular"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--unconfirmed)',
        border: '1px solid var(--unconfirmed)',
        borderRadius: 999,
        padding: '2px 9px',
      }}
      title={`${volumeRatio.toFixed(1)}x normal volume — thin enough that a move today would be discounted, not suppressed outright`}
    >
      Low liquidity · {volumeRatio.toFixed(1)}x normal
    </span>
  );
}
