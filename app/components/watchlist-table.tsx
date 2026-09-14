'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getClientUserId } from '../../src/lib/current-user-client';
import { Sparkline } from './sparkline';
import { RangeBar } from './range-bar';
import { HeartbeatDot } from './heartbeat-dot';
import { PersonalThreshold } from './personal-threshold';
import { UndoToast, type UndoState } from './undo-toast';
import { formatPct } from '../lib/format';
import type { WatchlistRow } from '../watchlist/rows';

export interface WatchlistSymbol {
  symbol: string;
  name: string;
  sector: string;
}

async function mutate(method: 'POST' | 'DELETE', symbol: string) {
  await fetch('/api/watchlist', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: getClientUserId(), symbol }),
  });
}

/** The 1D-change cell: "moved" and "moved and mattered" must look different at a glance (item 18). */
function DayChangeCell({ pct, significant }: { pct: number | null; significant: boolean }) {
  if (pct === null) return <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>—</span>;
  const color = pct >= 0 ? 'var(--up)' : 'var(--down)';
  return (
    <span
      className="tabular"
      style={{
        fontSize: 13,
        fontWeight: significant ? 700 : 500,
        color,
        padding: significant ? '2px 7px' : 0,
        borderRadius: significant ? 999 : 0,
        border: significant ? `1px solid ${color}` : 'none',
        display: 'inline-block',
      }}
      title={significant ? "Today's move cleared the significance bar" : undefined}
    >
      {formatPct(pct)}
    </span>
  );
}

export function WatchlistTable({ rows, available }: { rows: WatchlistRow[]; available: WatchlistSymbol[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState(available[0]?.symbol ?? '');
  const [undo, setUndo] = useState<UndoState | null>(null);

  async function handleRemove(symbol: string) {
    setPending(symbol);
    await mutate('DELETE', symbol);
    router.refresh();
    setPending(null);
    // Undoing a remove re-adds the row; the symbol's cursor and any
    // personal threshold were never touched by removeFromWatchlist, so
    // this is a real restore, not a fabricated one.
    setUndo({ message: `Removed ${symbol}.`, onUndo: () => mutate('POST', symbol).then(() => router.refresh()) });
  }

  async function handleAdd() {
    if (!toAdd) return;
    const symbol = toAdd;
    setPending(symbol);
    await mutate('POST', symbol);
    router.refresh();
    setPending(null);
    // Undoing an add deletes the row outright — a freshly-added symbol
    // has no prior baseline (cursor defaults to 0, no threshold set), so
    // there is nothing to restore, only something to remove.
    setUndo({ message: `Added ${symbol}.`, onUndo: () => mutate('DELETE', symbol).then(() => router.refresh()) });
  }

  return (
    <div>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--ink-muted)', fontSize: 14, padding: '24px 0' }}>Nothing on your watchlist yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabular" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              {/* The tour targets just the header row, not the whole
                  (often much taller than the viewport) table — driver.js
                  positions its popover relative to whatever it highlights,
                  and a tall element leaves it nowhere sensible to sit,
                  forcing an awkward fallback position and an unwanted
                  auto-scroll to center something too big to fit. */}
              <tr
                data-tour="watchlist-table"
                style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase' }}
              >
                <th style={{ fontWeight: 500, padding: '0 12px 10px 0' }}>Symbol</th>
                <th style={{ fontWeight: 500, padding: '0 12px 10px 0' }}>Price</th>
                <th style={{ fontWeight: 500, padding: '0 12px 10px 0' }}>1D</th>
                <th style={{ fontWeight: 500, padding: '0 12px 10px 0' }}>Chart</th>
                <th style={{ fontWeight: 500, padding: '0 12px 10px 0' }}>1D volume</th>
                <th style={{ fontWeight: 500, padding: '0 12px 10px 0' }}>Range</th>
                <th style={{ fontWeight: 500, padding: '0 0 10px' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.symbol} style={{ borderTop: '1px solid var(--rule)' }}>
                  <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {r.quality && <HeartbeatDot quality={r.quality} />}
                      <Link href={`/symbol/${r.symbol}`} style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 700 }}>
                        {r.symbol}
                      </Link>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2, fontFamily: 'var(--font-sans)' }}>{r.sector}</div>
                    {r.sinceCursorPct !== null && (
                      <div
                        style={{
                          fontSize: 10.5,
                          marginTop: 3,
                          color: r.significantSinceCursor ? (r.sinceCursorPct >= 0 ? 'var(--up)' : 'var(--down)') : 'var(--ink-faint)',
                        }}
                      >
                        {formatPct(r.sinceCursorPct)} since you left
                      </div>
                    )}
                    <span data-tour={i === 0 ? 'personal-threshold' : undefined}>
                      <PersonalThreshold symbol={r.symbol} thresholdPct={r.personalThresholdPct} exceeded={r.thresholdExceeded} />
                    </span>
                  </td>
                  <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'top' }}>
                    {r.latestClose !== null ? `₹${r.latestClose.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'top' }}>
                    <DayChangeCell pct={r.dayChangePct} significant={r.daySignificant} />
                  </td>
                  <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'top' }} data-tour={i === 0 ? 'sparkline' : undefined}>
                    {r.sparklineValues.length >= 2 && (
                      <Sparkline
                        values={r.sparklineValues}
                        width={140}
                        height={36}
                        eventIndices={r.eventIndices}
                        cursorIndex={r.cursorIndex ?? undefined}
                        significantSinceCursor={r.significantSinceCursor}
                      />
                    )}
                  </td>
                  <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'top', color: 'var(--ink-muted)' }}>
                    {r.volume !== null ? r.volume.toLocaleString('en-IN') : '—'}
                  </td>
                  <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'top' }}>
                    {r.latestClose !== null && r.fromDate && r.toDate && (
                      <RangeBar low={r.low} high={r.high} current={r.latestClose} fromDate={r.fromDate} toDate={r.toDate} />
                    )}
                  </td>
                  <td style={{ padding: '12px 0', verticalAlign: 'top', textAlign: 'right' }}>
                    <button
                      onClick={() => handleRemove(r.symbol)}
                      disabled={pending === r.symbol}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--down)',
                        fontWeight: 600,
                        fontSize: 11.5,
                        cursor: pending === r.symbol ? 'default' : 'pointer',
                        opacity: pending === r.symbol ? 0.5 : 1,
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 24, alignItems: 'center' }}>
          <select
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value)}
            className="tabular"
            style={{
              flex: 1,
              maxWidth: 360,
              padding: '10px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 13,
            }}
          >
            {available.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={pending === toAdd}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
              fontWeight: 600,
              fontSize: 13,
              cursor: pending === toAdd ? 'default' : 'pointer',
              opacity: pending === toAdd ? 0.5 : 1,
            }}
          >
            Add
          </button>
        </div>
      )}
      <UndoToast state={undo} onDismiss={() => setUndo(null)} />
    </div>
  );
}
