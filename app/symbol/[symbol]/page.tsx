import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSymbol } from '../../../db/queries/symbols';
import { getRecentCandles } from '../../../db/queries/candles';
import { getRecentEventsForSymbol } from '../../../db/queries/events';
import { getLatestClusterForSymbol } from '../../../db/queries/clusters';
import { Sparkline } from '../../components/sparkline';
import { WhyGrouped } from '../../components/why-grouped';
import { ColorizedHeadline } from '../../components/colorized-headline';
import { DataQualityNotice } from '../../components/data-quality-notice';
import { HeartbeatDot } from '../../components/heartbeat-dot';
import { LowLiquidityTag } from '../../components/low-liquidity-tag';
import { formatPct } from '../../lib/format';

const KIND_DOT_COLOR: Record<string, string> = {
  structural_break: 'var(--down)',
  corporate_action: 'var(--accent-blue)',
  event_resolved: 'var(--up)',
  residual_move: 'var(--unconfirmed)',
};
import { classifyFreshness, classifyQuoteQuality } from '../../../worker/freshness';
import { pollingTierFor } from '../../../worker/polling-tiers';
import { getWatchlistCounts } from '../../../db/queries/watchlist';
import { explainWhyQuietForSymbols } from '../../../src/digest/why-quiet';

export const dynamic = 'force-dynamic';

// Below this, a move today would already be discounted by the
// significance engine's own volume weight (decompose.ts fully suppresses
// under ~0.37x normal) — flagging at 0.6x gives an earlier, softer
// warning than "the engine would ignore this entirely."
const LOW_LIQUIDITY_THRESHOLD = 0.6;

export default async function SymbolDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: symbolParam } = await params;
  const symbol = symbolParam.toUpperCase();

  const meta = await getSymbol(symbol);
  if (!meta) notFound();

  const [candles, events, cluster, watchlistCounts, [quietReason]] = await Promise.all([
    getRecentCandles(symbol, 20),
    getRecentEventsForSymbol(symbol, 15),
    getLatestClusterForSymbol(symbol),
    getWatchlistCounts(),
    explainWhyQuietForSymbols([symbol]),
  ]);

  const latest = candles[candles.length - 1];
  const prior = candles[candles.length - 2];
  const dayChangePct = latest && prior ? ((latest.c - prior.c) / prior.c) * 100 : null;
  const { intervalMs: expectedIntervalMs } = pollingTierFor(watchlistCounts.get(symbol) ?? 0);
  const now = new Date();
  const freshness = latest ? classifyFreshness(latest.ts, now, expectedIntervalMs) : null;
  const quality = latest && freshness ? classifyQuoteQuality(freshness, latest.confirmed) : null;
  const isLowLiquidity =
    quietReason && quietReason.volumeRatio !== null && quietReason.volumeRatio < LOW_LIQUIDITY_THRESHOLD;

  const peers = cluster ? cluster.members.filter((m) => m !== symbol) : [];
  const clusterLabel = cluster
    ? cluster.method === 'sector'
      ? cluster.cluster_id.replace('sector:', '')
      : 'correlation cluster'
    : null;
  // Primary gloss leads with a plain sentence; the actual correlation
  // numbers are a secondary reveal via WhyGrouped's click-to-expand, not
  // the first thing shown.
  const clusterGloss =
    cluster?.method === 'sector'
      ? `These move together — all ${clusterLabel} companies.`
      : cluster
        ? 'These have moved together over the past 130 sessions.'
        : null;

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            {quality && <HeartbeatDot quality={quality} />}
            <h1 style={{ fontSize: 26 }}>{meta.symbol}</h1>
          </div>
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

      {latest && quality && <DataQualityNotice quality={quality} asOf={latest.ts} now={now} />}

      {latest && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 11,
            color: 'var(--ink-faint)',
            letterSpacing: '0.02em',
            marginBottom: 24,
          }}
        >
          <span>as of {latest.session_date}</span>
          {isLowLiquidity && <LowLiquidityTag volumeRatio={quietReason!.volumeRatio!} />}
        </div>
      )}

      {candles.length >= 2 && (
        <div style={{ marginBottom: 40 }}>
          <Sparkline values={candles.map((c) => c.c)} width={632} height={64} />
          {/* The line's color reflects the *whole* window's net direction
              (first vs. last close here), not today's single-day change
              shown up top — those can legitimately disagree (a small
              up-day inside an overall downtrend), and previously nothing
              on the page said the two numbers were answering different
              questions. */}
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0' }}>
            {candles.length} sessions, {candles[0]!.session_date} → {candles[candles.length - 1]!.session_date} — line
            color is this window's net direction, not today&rsquo;s move
          </p>
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
          <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>{clusterGloss}</p>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
            {peers.length === 0
              ? 'No peers currently.'
              : peers.map((p, i) => (
                  <span key={p}>
                    <Link href={`/symbol/${p}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>
                      {p}
                    </Link>
                    {i < peers.length - 1 ? ', ' : ''}
                  </span>
                ))}
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
