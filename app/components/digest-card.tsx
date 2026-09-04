'use client';

import Link from 'next/link';
import type { DigestItem, DigestItemKind } from '../../src/digest/types';
import { AckButton } from './ack-button';
import { ColorizedHeadline } from './colorized-headline';
import { useSimpleDetail } from './simple-detail-context';

function formatRange(fromTs: string, toTs: string): string {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  // Pinned to UTC deliberately: this renders in a Client Component, which
  // Next.js also renders once on the server for the initial HTML. Without
  // an explicit timeZone, toLocaleDateString falls back to the runtime's
  // local timezone — the server (UTC) and a visitor's browser (whatever
  // their OS is set to) can then compute a different calendar day for the
  // same instant, which is a real React hydration mismatch, not a false
  // alarm. Every timestamp in this app is generated/stored UTC-anchored
  // (see src/seed/generate.ts), so UTC is also the *correct* calendar day
  // here, not just the safe one.
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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

/**
 * "Simple" is a generic templated sentence needing nothing beyond the
 * symbol name and kind — computed client-side, no new backend data.
 * "Detailed" is just the existing headline, unchanged. Corporate actions
 * and resolved-only items are already a short factual sentence either
 * way, so the toggle doesn't touch them.
 */
function simpleHeadline(kind: DigestItemKind, symbol: string): string | null {
  switch (kind) {
    case 'residual_move':
    case 'structural_break':
      return `This is an unusually large move for ${symbol}.`;
    case 'resolved':
    case 'corporate_action':
      return null; // always show the original — it's already simple
  }
}

export function DigestCard({ item }: { item: DigestItem }) {
  const [mode] = useSimpleDetail();
  const upToEventId = Math.max(...item.eventIds);
  const simple = simpleHeadline(item.kind, item.symbol);
  const showSimple = mode === 'simple' && simple !== null;
  // A resolution clause must stay visible no matter the toggle state —
  // Detailed mode already carries it inside item.headline, but Simple
  // mode replaces headline wholesale, so it has to be re-appended here.
  const simpleText = item.resolutionNote ? `${simple} ${item.resolutionNote}` : simple;

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
          {showSimple ? simpleText : <ColorizedHeadline text={item.headline} />}
        </p>
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <AckButton symbol={item.symbol} upToEventId={upToEventId} />
      </div>
    </article>
  );
}
