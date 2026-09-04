import { getDataMode } from '../../src/lib/data-mode';
import { loadOrGenerateDataset } from '../../src/seed/dataset';
import { listActiveSymbols } from '../../db/queries/symbols';
import { getWatchlistCounts } from '../../db/queries/watchlist';
import { getUnconfirmedCandles, countIngestedSessionDates } from '../../db/queries/candles';
import { pollingTierFor, DEFAULT_TIER_THRESHOLDS, type PollingTier } from '../../worker/polling-tiers';

export const dynamic = 'force-dynamic';

const TIER_COLOR: Record<PollingTier, string> = {
  hot: 'var(--down)',
  warm: 'var(--accent-blue)',
  cold: 'var(--ink-faint)',
};

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`;
  return `${ms / 60_000}min`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--ink-faint)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </h2>
  );
}

export default async function SystemPage() {
  const mode = getDataMode();
  const [symbols, watcherCounts, unconfirmed, ingestedDays] = await Promise.all([
    listActiveSymbols(),
    getWatchlistCounts(),
    getUnconfirmedCandles(),
    countIngestedSessionDates(),
  ]);

  let totalDays: number | null = null;
  if (mode === 'replay') {
    try {
      totalDays = loadOrGenerateDataset().sessionDates.length;
    } catch {
      totalDays = null;
    }
  }

  const tiered = symbols
    .map((s) => {
      const count = watcherCounts.get(s.symbol) ?? 0;
      return { symbol: s.symbol, count, ...pollingTierFor(count) };
    })
    .sort((a, b) => b.count - a.count);

  const t = DEFAULT_TIER_THRESHOLDS;

  return (
    <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>System</h1>
      <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginTop: 0, marginBottom: 40, maxWidth: 560 }}>
        How this actually runs, not just what the README claims — the real polling policy, every source
        disagreement the worker has caught, and the trade-offs made to ship this in the time available.
      </p>

      <section style={{ marginBottom: 40 }}>
        <SectionLabel>Data mode</SectionLabel>
        <p style={{ fontSize: 15, margin: 0 }}>
          {mode === 'replay' ? (
            <>
              Replay
              {totalDays !== null && (
                <span className="tabular" style={{ color: 'var(--ink-muted)' }}>
                  {' '}
                  · day {Math.min(ingestedDays, totalDays)} of {totalDays}
                </span>
              )}
            </>
          ) : (
            'Live'
          )}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '6px 0 0', maxWidth: 520 }}>
          {mode === 'replay'
            ? 'Deliberate: a real NSE session runs 9:15–15:30 IST, so a live feed would sit quiet outside market hours. Replay keeps the demo showing a moving market regardless of when it’s viewed.'
            : 'Streaming the real vendor feed — no synthetic data involved.'}
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <SectionLabel>Polling policy</SectionLabel>
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '0 0 14px', maxWidth: 560 }}>
          The worker polls a symbol as often as people are actually watching it —
          <span className="tabular"> ≥{t.hotMinWatchers} watchers → hot ({formatInterval(t.hotIntervalMs)})</span>,
          <span className="tabular"> ≥{t.warmMinWatchers} → warm ({formatInterval(t.warmIntervalMs)})</span>,
          <span className="tabular"> else cold ({formatInterval(t.coldIntervalMs)})</span> — computed live from
          real watchlist counts below, not illustrative numbers.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabular" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 11 }}>
                <th style={{ fontWeight: 500, padding: '0 12px 8px 0' }}>Symbol</th>
                <th style={{ fontWeight: 500, padding: '0 12px 8px 0' }}>Watchers</th>
                <th style={{ fontWeight: 500, padding: '0 12px 8px 0' }}>Tier</th>
                <th style={{ fontWeight: 500, padding: '0 0 8px 0' }}>Poll interval</th>
              </tr>
            </thead>
            <tbody>
              {tiered.map((row) => (
                <tr key={row.symbol} style={{ borderTop: '1px solid var(--rule)' }}>
                  <td style={{ padding: '8px 12px 8px 0', fontWeight: 600 }}>{row.symbol}</td>
                  <td style={{ padding: '8px 12px 8px 0', color: 'var(--ink-muted)' }}>{row.count}</td>
                  <td style={{ padding: '8px 12px 8px 0' }}>
                    <span style={{ color: TIER_COLOR[row.tier], fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>
                      {row.tier}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0' }}>{formatInterval(row.intervalMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <SectionLabel>Source conflicts</SectionLabel>
        {unconfirmed.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0 }}>
            No source disagreements on record — every ingested session had a confirming secondary quote within
            tolerance.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '0 0 12px', maxWidth: 560 }}>
              Every session where the primary and secondary quote sources disagreed past tolerance
              (worker/reconcile.ts). No significance event is ever raised on an unconfirmed day — the disagreement
              wins over guessing.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unconfirmed.map((c) => (
                <div
                  key={`${c.symbol}-${c.session_date}`}
                  className="tabular"
                  style={{
                    fontSize: 13,
                    padding: '10px 14px',
                    background: 'var(--surface)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.symbol}</span>
                  <span style={{ color: 'var(--ink-muted)' }}> · {c.session_date} · sources disagreed, skipped</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <SectionLabel>Design decisions</SectionLabel>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Two-source reconciliation is a real, wired-through code path (worker/reconcile.ts), not a mockup — the conflict record above came from replay-mode traffic running through the exact same logic a second live vendor would use.',
            'Clusters are recomputed weekly and cached, never on the request path — a 130-session correlation matrix across every symbol pair is deliberately precomputed rather than run live per page view.',
            'The event log is append-only and cursors only move forward — enforced at the database level (a trigger rejects UPDATE/DELETE on events), not just by convention. Corrections are new events referencing the original, never edits.',
          ].map((point, i) => (
            <li key={i} style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.55 }}>
              {point}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
