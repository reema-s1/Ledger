import { formatRangeWindowLabel } from '../lib/format';

/**
 * Item 17: a low/high indicator using whatever history window is actually
 * available, labeled by its real length — never "52W" unless the data
 * actually covers a year (see app/lib/format.ts's formatRangeWindowLabel).
 */
export function RangeBar({ low, high, current, fromDate, toDate }: { low: number; high: number; current: number; fromDate: string; toDate: string }) {
  const range = high - low || 1;
  const posPct = Math.min(100, Math.max(0, ((current - low) / range) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 90 }}>
      <div style={{ position: 'relative', height: 4, background: 'var(--rule)', borderRadius: 2 }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `calc(${posPct}% - 3px)`,
            top: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent-blue)',
            border: '1.5px solid var(--surface)',
          }}
        />
      </div>
      <div className="tabular" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--ink-faint)' }}>
        <span>₹{low.toFixed(0)}</span>
        <span>{formatRangeWindowLabel(fromDate, toDate)}</span>
        <span>₹{high.toFixed(0)}</span>
      </div>
    </div>
  );
}
