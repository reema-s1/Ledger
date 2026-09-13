import type { QuoteQuality } from '../../worker/freshness';

const QUALITY_COLOR: Record<QuoteQuality, string> = {
  fresh: 'var(--up)',
  stale: 'var(--unconfirmed)',
  unavailable: 'var(--down)',
  invalid: 'var(--down)',
};

/**
 * A small heartbeat: pulses only when the feed is actually live and on
 * cadence ('fresh') — the moment a symbol crosses its own expected
 * refresh interval (worker/freshness.ts's classifyFreshness, already
 * scaled per-symbol, not a fixed global timeout), the dot stops pulsing
 * and changes color, itself the signal that something needs a look.
 */
export function HeartbeatDot({ quality }: { quality: QuoteQuality }) {
  const color = QUALITY_COLOR[quality];
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 8,
        height: 8,
        flexShrink: 0,
      }}
    >
      {quality === 'fresh' && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: color,
            opacity: 0.5,
            animation: 'heartbeat-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        />
      )}
      <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: color }} />
    </span>
  );
}
