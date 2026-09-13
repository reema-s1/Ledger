import { buildStructuredExplanation } from '../../src/digest/structured-explanation';
import type { Decomposition } from '../../src/significance/types';

/**
 * The expanded view behind a card's "Details" toggle — the same
 * decomposition already summarized in one sentence (the headline) and
 * four chips (DecompositionMetrics), now broken into labeled lines: the
 * move itself, what the market/cluster explains, what's left over and
 * why that's unusual for this stock, and the volume context. No new
 * data, no new computation — a different shape of the same numbers.
 */
export function StructuredExplanationBlock({ d, clusterLabel }: { d: Decomposition; clusterLabel?: string }) {
  const lines = buildStructuredExplanation(d, clusterLabel);
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, auto) 1fr',
        columnGap: 14,
        rowGap: 6,
        margin: '12px 0 0',
        paddingTop: 12,
        borderTop: '1px solid var(--rule)',
      }}
    >
      {lines.map((line) => (
        <div key={line.label} style={{ display: 'contents' }}>
          <dt style={{ fontSize: 11.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{line.label}</dt>
          <dd className="tabular" style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-muted)' }}>
            {line.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}
