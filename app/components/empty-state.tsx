import { ShowMeAnyway } from './show-me-anyway';
import { LedgerMark } from './ledger-mark';

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
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1.5px solid var(--rule)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LedgerMark size={9} />
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>Nothing needs you today.</h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
        {watchlistCount} {watchlistCount === 1 ? 'symbol' : 'symbols'} on your watchlist, all quiet.
      </p>
      <ShowMeAnyway />
    </div>
  );
}
