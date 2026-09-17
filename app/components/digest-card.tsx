'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DigestItem, DigestItemKind } from '../../src/digest/types';
import { AckButton } from './ack-button';
import { ColorizedHeadline, extractHeadlineDirection } from './colorized-headline';
import { DecompositionMetrics } from './decomposition-metrics';
import { StructuredExplanationBlock } from './structured-explanation-block';
import { useExplainLookup, ExplainTrigger, ExplainResultBlock } from './explain-button';
import { TrendIcon } from './trend-icon';
import { useSimpleDetail } from './simple-detail-context';

/** Kinds a "Find possible explanation" lookup makes sense for — a residual/
 * z-score/volume-based flag, per llm-addition.md. Not corporate actions
 * (already mechanically explained) or resolved-only items (already settled). */
const EXPLAINABLE_KINDS = new Set<DigestItemKind>(['residual_move', 'structural_break']);

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
 *
 * structural_break and residual_move get their own wording rather than
 * sharing one template — a break (the cluster correlation itself
 * changing) is a different, rarer kind of event than an ordinary
 * larger-than-usual move, and Simple mode collapsing them into an
 * identical sentence would erase exactly the distinction Detailed mode
 * (and the BREAK badge) goes out of its way to make.
 */
function simpleHeadline(kind: DigestItemKind, symbol: string): string | null {
  switch (kind) {
    case 'structural_break':
      return `${symbol} is behaving differently from the stocks it usually moves with.`;
    case 'residual_move':
      return `This is a larger move than usual for ${symbol}.`;
    case 'resolved':
    case 'corporate_action':
      return null; // always show the original — it's already simple
  }
}

export function DigestCard({
  item,
  showExplain = false,
  showAck = true,
  linkSymbol = true,
}: {
  item: DigestItem;
  showExplain?: boolean;
  /** False in Playback — acking a historical reconstruction makes no sense (it's "not cursor-filtered... independent of what any device has actually acknowledged", per the playback API's own docs). */
  showAck?: boolean;
  /** False on /simulate, whose made-up ticker has no symbol page to open. */
  linkSymbol?: boolean;
}) {
  const [mode] = useSimpleDetail();
  const [expanded, setExpanded] = useState(false);
  const upToEventId = Math.max(...item.eventIds);
  const simple = simpleHeadline(item.kind, item.symbol);
  const showSimple = mode === 'simple' && simple !== null;
  // A resolution clause must stay visible no matter the toggle state —
  // Detailed mode already carries it inside item.headline, but Simple
  // mode replaces headline wholesale, so it has to be re-appended here.
  const simpleText = item.resolutionNote ? `${simple} ${item.resolutionNote}` : simple;
  const canExplain = showExplain && EXPLAINABLE_KINDS.has(item.kind);
  // eventIds mixes original flagged-move events with any later resolution
  // events folded in (see DigestItem's eventIds doc) — a resolution event
  // always has a strictly higher id than the original it resolves (it's
  // appended later in the append-only log), so the minimum id in the
  // group is always an original flagged-move event, never a resolution.
  const originalEventId = Math.min(...item.eventIds);
  const explain = useExplainLookup(originalEventId);
  // Always read off the real headline (not the Simple-mode template text,
  // which has no percentage in it) so the icon can never disagree with
  // whichever text is actually showing.
  const direction = extractHeadlineDirection(item.headline);

  return (
    <article
      style={{
        padding: '18px 20px',
        marginBottom: 10,
        background: 'var(--surface)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <div
            className="tabular"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink-muted)', letterSpacing: '0.04em' }}
          >
            {direction && <TrendIcon direction={direction} />}
            <KindDot kind={item.kind} />
            {linkSymbol ? (
              <Link href={`/symbol/${item.symbol}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
                {item.symbol}
              </Link>
            ) : (
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{item.symbol}</span>
            )}
            <span>· {formatRange(item.fromTs, item.toTs)}</span>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 16, lineHeight: 1.45, margin: 0, color: 'var(--ink)' }}>
            {showSimple ? simpleText : <ColorizedHeadline text={item.headline} />}
          </p>
          {/* The four metrics every card shows, always — "does this matter"
              at a glance, per item 2/14: not hidden behind a toggle, and
              never a folded episode/chapter's fabricated aggregate (those
              never carry a decomposition — see src/digest/compact.ts). */}
          {item.decomposition && <DecompositionMetrics d={item.decomposition} />}
        </div>
        {(showAck || canExplain) && (
          <div style={{ flexShrink: 0, paddingTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            {showAck && <AckButton symbol={item.symbol} upToEventId={upToEventId} />}
            {canExplain && <ExplainTrigger state={explain.state} onClick={explain.run} />}
          </div>
        )}
      </div>
      {item.decomposition && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 0 0',
              margin: 0,
              color: 'var(--ink-faint)',
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.02em',
              cursor: 'pointer',
            }}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide breakdown ▴' : 'Show breakdown ▾'}
          </button>
          {expanded && <StructuredExplanationBlock d={item.decomposition} />}
        </>
      )}
      {canExplain && <ExplainResultBlock state={explain.state} result={explain.result} onRetry={explain.run} onDismiss={explain.reset} />}
    </article>
  );
}
