/** Small display-only formatters shared across pages — no computation, just presentation. */

export function formatPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/**
 * Item 17: label a range indicator by the real span of history actually
 * used, never a conventional label ("52W") the data doesn't back up.
 * Computed from the two real session dates at the edges of whatever
 * window was fetched, not assumed from a nominal cadence.
 */
export function formatRangeWindowLabel(fromDate: string, toDate: string): string {
  const days = Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000));
  if (days < 60) return `${days}D range`;
  if (days < 330) return `~${Math.round(days / 30)}mo range`;
  const years = days / 365;
  return years < 1.5 ? '~1Y range' : `~${years.toFixed(1)}Y range`;
}

export function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
