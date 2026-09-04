import type { ResolutionStats } from '../../src/digest/get-digest';

/**
 * One small, honest calibration line — never a badge, never a score,
 * deliberately not congratulatory. Only renders once there's something
 * to say; an empty "0 held, 0 reverted" line is just noise.
 */
export function ResolutionStatsLine({ stats }: { stats: ResolutionStats }) {
  if (stats.total === 0) return null;

  const parts = [
    stats.held > 0 ? `${stats.held} held` : null,
    stats.partially_reverted > 0 ? `${stats.partially_reverted} partially reverted` : null,
    stats.reverted > 0 ? `${stats.reverted} reverted` : null,
  ].filter((p): p is string => p !== null);

  return (
    <p
      className="tabular"
      style={{ fontSize: 11.5, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 40 }}
    >
      Of the last {stats.total} alert{stats.total === 1 ? '' : 's'}: {parts.join(', ')}.
    </p>
  );
}
