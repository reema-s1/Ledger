import Link from 'next/link';
import type { DigestItem } from '../../src/digest/types';
import { AckButton } from './ack-button';

function formatRange(fromTs: string, toTs: string): string {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  return fromTs === toTs ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

export function DigestCard({ item }: { item: DigestItem }) {
  const upToEventId = Math.max(...item.eventIds);

  return (
    <article
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        padding: '18px 20px',
        marginBottom: 10,
        background: 'var(--surface)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
        <div
          className="tabular"
          style={{ fontSize: 11, color: 'var(--ink-muted)', letterSpacing: '0.04em' }}
        >
          <Link href={`/symbol/${item.symbol}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
            {item.symbol}
          </Link>{' '}
          · {formatRange(item.fromTs, item.toTs)}
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 16, lineHeight: 1.45, margin: 0, color: 'var(--ink)' }}>
          {item.headline}
        </p>
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <AckButton symbol={item.symbol} upToEventId={upToEventId} />
      </div>
    </article>
  );
}
