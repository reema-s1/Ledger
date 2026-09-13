'use client';

import { useState } from 'react';
import { buildStructuredExplanation, type ExplanationLocale } from '../../src/digest/structured-explanation';
import type { Decomposition } from '../../src/significance/types';

/**
 * The expanded view behind a card's "Details" toggle — the same
 * decomposition already summarized in one sentence (the headline) and
 * four chips (DecompositionMetrics), now broken into labeled lines: the
 * move itself, what the market/cluster explains, what's left over and
 * why that's unusual for this stock, and the volume context. No new
 * data, no new computation — a different shape of the same numbers.
 *
 * Item 23: a language toggle re-renders the same lines through the same
 * fixed phrase table (src/digest/structured-explanation.ts) — never a
 * translation API call, so a number can never come back altered.
 */
export function StructuredExplanationBlock({ d, clusterLabel }: { d: Decomposition; clusterLabel?: string }) {
  const [locale, setLocale] = useState<ExplanationLocale>('en');
  const lines = buildStructuredExplanation(d, clusterLabel, locale);

  return (
    <div style={{ margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 4, fontSize: 10.5 }}>
          {(['en', 'hi'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              style={{
                background: locale === l ? 'var(--accent-soft)' : 'none',
                border: '1px solid var(--rule)',
                borderRadius: 999,
                padding: '2px 8px',
                color: locale === l ? 'var(--accent-blue)' : 'var(--ink-faint)',
                fontWeight: locale === l ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {l === 'en' ? 'EN' : 'हिं'}
            </button>
          ))}
        </div>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, auto) 1fr', columnGap: 14, rowGap: 6, margin: 0 }}>
        {lines.map((line) => (
          <div key={line.label} style={{ display: 'contents' }}>
            <dt style={{ fontSize: 11.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{line.label}</dt>
            <dd className="tabular" style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-muted)' }}>
              {line.text}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
