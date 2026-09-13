import type { Decomposition } from '../../src/significance/types';
import { plainLanguageZ } from '../../src/digest/structured-explanation';

/**
 * The four metrics shown consistently on every flagged card, per the
 * significance engine's own decomposition (already computed and stored —
 * see src/digest/types.ts's DigestItem.decomposition). Deliberately not
 * a generic technical indicator (RSI, MACD) — every value here is the
 * actual differentiator this product is built on, already computed, not
 * a new client-side calculation from raw candles.
 */
function Chip({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'warn' }) {
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : tone === 'warn' ? 'var(--unconfirmed)' : 'var(--ink)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span className="tabular" style={{ fontSize: 12.5, fontWeight: 600, color }}>
        {value}
      </span>
    </div>
  );
}

export function DecompositionMetrics({ d }: { d: Decomposition }) {
  const volumeValue = d.volumeDataMissing ? 'no baseline' : `${d.volumeRatio.toFixed(1)}x normal`;
  const volumeTone = d.volumeDataMissing ? 'warn' : d.volumeRatio < 0.5 ? 'warn' : undefined;

  const moveValue = `${d.residual >= 0 ? '+' : ''}${(d.residual * 100).toFixed(1)}%`;
  const moveTone = d.residual >= 0 ? 'up' : 'down';

  const zValue = `${Math.abs(d.residualZ).toFixed(1)}σ`;

  const signalValue = d.isStructuralBreak ? 'Structural break' : 'Residual move';
  const signalTone = d.isStructuralBreak ? 'down' : undefined;

  return (
    <div
      className="tabular"
      style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}
      title={`${plainLanguageZ(d.residualZ)} — vs the cluster's own move, not a flat threshold`}
    >
      <Chip label="Volume" value={volumeValue} tone={volumeTone} />
      <Chip label="Vs cluster" value={moveValue} tone={moveTone} />
      <Chip label="Z-score" value={zValue} />
      <Chip label="Signal" value={signalValue} tone={signalTone} />
    </div>
  );
}
