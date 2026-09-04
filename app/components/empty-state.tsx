import { ShowMeAnyway } from './show-me-anyway';

interface EmptyStateProps {
  watchlistCount: number;
}

/**
 * The most important screen in the product, per the brief: most days
 * this is what people see, and it has to read as the point, not a
 * fallback. Calm, centered, generous space — never styled like an error
 * or a loading state.
 */
export function EmptyState({ watchlistCount }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: '96px 24px 120px',
        textAlign: 'center',
      }}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="empty-mark" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--accent-blue)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" stroke="var(--rule)" strokeWidth="1.5" />
        <circle cx="18" cy="18" r="4" fill="url(#empty-mark)" />
      </svg>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>Nothing needs you today.</h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
        {watchlistCount} {watchlistCount === 1 ? 'symbol' : 'symbols'} on your watchlist, all quiet.
      </p>
      <ShowMeAnyway />
    </div>
  );
}
