import Link from 'next/link';
import { LedgerMark } from './components/ledger-mark';

export default function NotFound() {
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
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>Nothing here.</h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
        This page doesn&rsquo;t exist.
      </p>
      <Link href="/" style={{ color: 'var(--accent-blue)', fontSize: 14 }}>
        Back to Ledger
      </Link>
    </div>
  );
}
