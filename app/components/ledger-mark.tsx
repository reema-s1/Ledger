/**
 * The brand mark: a hard diagonal split (not a blended gradient) between
 * the two accent colors, echoing the Groww-style two-tone reference —
 * two solid regions meeting at a clean edge, not a smooth blend.
 */
export function LedgerMark({ size = 22 }: { size?: number }) {
  const r = size / 2 - 1;
  const c = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <clipPath id="ledger-mark-clip">
          <circle cx={c} cy={c} r={r} />
        </clipPath>
      </defs>
      <g clipPath="url(#ledger-mark-clip)">
        <rect x="0" y="0" width={size} height={size} fill="var(--accent)" />
        <polygon points={`0,0 ${size},0 0,${size}`} fill="var(--accent-blue)" />
      </g>
    </svg>
  );
}
