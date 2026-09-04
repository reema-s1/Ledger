'use client';

import { useEffect } from 'react';
import { LedgerMark } from './components/ledger-mark';

/**
 * Next.js renders this in place of any route under app/ whose Server
 * Component throws — a real possibility now that a request can hit a
 * cold Vercel function and a cold Neon connection at once. Calm and on-
 * brand, same visual register as EmptyState, not a stack trace.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
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
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Something didn&rsquo;t load.</h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-muted)', margin: 0, maxWidth: 380 }}>
        {error.digest ? `Error ${error.digest} — likely a cold start.` : 'Likely a cold start on the server or database.'}{' '}
        Try again in a moment.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 20px',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--accent)',
          color: 'var(--accent-contrast)',
          fontWeight: 600,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </main>
  );
}
