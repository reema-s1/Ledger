import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSymbol } from '../../../db/queries/symbols';
import { getRecentCandles } from '../../../db/queries/candles';
import { getRecentEventsForSymbol } from '../../../db/queries/events';
import { getLatestClusterForSymbol } from '../../../db/queries/clusters';
import { Sparkline } from '../../components/sparkline';
import { WhyGrouped } from '../../components/why-grouped';
import { ColorizedHeadline } from '../../components/colorized-headline';

const KIND_DOT_COLOR: Record<string, string> = {
  structural_break: 'var(--down)',
  corporate_action: 'var(--accent-blue)',
  event_resolved: 'var(--up)',
  residual_move: 'var(--unconfirmed)',
};
import { checkFreshness, DEFAULT_STALE_THRESHOLD_MS } from '../../../worker/freshness';

export const dynamic = 'force-dynamic';

function formatPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export default async function SymbolDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: symbolParam } = await params;
  const symbol = symbolParam.toUpperCase();

  const meta = await getSymbol(symbol);
  if (!meta) notFound();

  const [candles, events, cluster] = await Promise.all([
    getRecentCandles(symbol, 20),
    getRecentEventsForSymbol(symbol, 15),
    getLatestClusterForSymbol(symbol),
  ]);

  const latest = candles[candles.length - 1];
  const prior = candles[candles.length - 2];
  const dayChangePct = latest && prior ? ((latest.c - prior.c) / prior.c) * 100 : null;
  const freshness = latest ? checkFreshness(latest.ts, new Date(), DEFAULT_STALE_THRESHOLD_MS) : null;

  const peers = cluster ? cluster.members.filter((m) => m !== symbol) : [];
  const clusterLabel = cluster
    ? cluster.method === 'sector'
      ? cluster.cluster_id.replace('sector:', '')
      : 'correlation cluster'
    : null;

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>{meta.symbol}</h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: '4px 0 0' }}>
            {meta.name} · {meta.sector}
          </p>
        </div>
        {latest && (
          <div style={{ textAlign: 'right' }}>
            <div className="tabular" style={{ fontSize: 20, fontWeight: 500 }}>
              ₹{latest.c.toFixed(2)}
            </div>
            {dayChangePct !== null && (
              <div
                className="tabular"
                style={{ fontSize: 13, color: dayChangePct >= 0 ? 'var(--up)' : 'var(--down)' }}
              >
                {formatPct(dayChangePct)}
              </div>
            )}
          </div>
        )}
      </div>

      {latest && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            fontSize: 11,
            color: 'var(--ink-faint)',
            letterSpacing: '0.02em',
            marginBottom: 24,
          }}
        >
          <span>as of {latest.session_date}</span>
          {freshness === 'stale' && <span style={{ color: 'var(--unconfirmed)' }}>· stale</span>}
          {!latest.confirmed && <span style={{ color: 'var(--unconfirmed)' }}>· unconfirmed</span>}
        </div>
      )}

      {candles.length >= 2 && (
        <div style={{ marginBottom: 40 }}>
          <Sparkline values={candles.map((c) => c.c)} width={632} height={64} />
        </div>
      )}

      {clusterLabel && (
        <section style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--ink-faint)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Cluster
          </h2>
          <p style={{ fontSize: 14, margin: 0 }}>
            Grouped with{' '}
            {peers.length === 0
              ? 'no peers currently.'
              : peers.map((p, i) => (
                  <span key={p}>
                    <Link href={`/symbol/${p}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
                      {p}
                    </Link>
                    {i < peers.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
            <span style={{ color: 'var(--ink-muted)' }}>({clusterLabel})</span>
          </p>
          {peers.length > 0 && <WhyGrouped symbol={symbol} />}
        </section>
      )}

      <section>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--ink-faint)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Recent events
        </h2>
        {events.length === 0 && (
          <p style={{ color: 'var(--ink-muted)', fontSize: 14, padding: '20px 0' }}>
            Nothing flagged for {symbol} recently.
          </p>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            style={{
              padding: '14px 18px',
              marginBottom: 8,
              background: 'var(--surface)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div
              className="tabular"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: KIND_DOT_COLOR[e.kind] ?? 'var(--ink-faint)',
                  flexShrink: 0,
                }}
              />
              <span>
                {e.ts.toISOString().slice(0, 10)} · {e.kind.replace('_', ' ')}
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 15, margin: 0 }}>
              <ColorizedHeadline text={e.explanation ?? ''} />
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
