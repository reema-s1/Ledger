/** Small display-only formatters shared across pages — no computation, just presentation. */

export function formatPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
