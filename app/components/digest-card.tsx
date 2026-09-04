import Link from 'next/link';
import type { DigestItem, DigestItemKind } from '../../src/digest/types';
import { AckButton } from './ack-button';
import { ColorizedHeadline } from './colorized-headline';

function formatRange(fromTs: string, toTs: string): string {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  return fromTs === toTs ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

const KIND_META: Record<DigestItemKind, { color: string; label: string | null }> = {
  // The headline differentiator of the whole product — shouldn't read
  // identically to a routine move.
  structural_break: { color: 'var(--down)', label: 'BREAK' },
  corporate_action: { color: 'var(--accent-blue)', label: 'ACTION' },
  resolved: { color: 'var(--up)', label: 'RESOLVED' },
  residual_move: { color: 'var(--unconfirmed)', label: null },
};

function KindDot({ kind }: { kind: DigestItemKind }) {
  const meta = KIND_META[kind];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }}
      />
      {meta.label && (
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  );
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
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink-muted)', letterSpacing: '0.04em' }}
        >
          <KindDot kind={item.kind} />
          <Link href={`/symbol/${item.symbol}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
            {item.symbol}
          </Link>
          <span>· {formatRange(item.fromTs, item.toTs)}</span>
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 16, lineHeight: 1.45, margin: 0, color: 'var(--ink)' }}>
          <ColorizedHeadline text={item.headline} />
        </p>
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <AckButton symbol={item.symbol} upToEventId={upToEventId} />
      </div>
    </article>
  );
}
