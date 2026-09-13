import Link from 'next/link';

export interface DivergenceEntry {
  symbol: string;
  residualZ: number | null;
  clearedBar: boolean;
}

/**
 * Item 15: a peer-group divergence comparison, extending the Clusters
 * screen rather than a parallel view — same real decomposition
 * (src/digest/why-quiet.ts, already used by "Show me anyway") re-read for
 * every member of a group and sorted by how far each has actually
 * drifted from its peers right now, not just which cluster it's in.
 */
export function DivergenceRow({ entry, maxAbsZ }: { entry: DivergenceEntry; maxAbsZ: number }) {
  const z = entry.residualZ;
  const absZ = z !== null ? Math.abs(z) : 0;
  const widthPct = maxAbsZ > 0 ? Math.min(100, (absZ / maxAbsZ) * 100) : 0;
  const color = entry.clearedBar ? (z !== null && z < 0 ? 'var(--down)' : 'var(--up)') : 'var(--ink-faint)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 48px', alignItems: 'center', gap: 10 }}>
      <Link href={`/symbol/${entry.symbol}`} className="tabular" style={{ fontSize: 12, color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600 }}>
        {entry.symbol}
      </Link>
      <div style={{ height: 5, background: 'var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${widthPct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>
        {z !== null ? `${absZ.toFixed(1)}σ` : '—'}
      </span>
    </div>
  );
}
