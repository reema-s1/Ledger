'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getClientUserId } from '../../src/lib/current-user-client';

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

export function WatchlistControls({
  current,
  available,
}: {
  current: WatchlistSymbol[];
  available: WatchlistSymbol[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState(available[0]?.symbol ?? '');

  async function handleRemove(symbol: string) {
    setPending(symbol);
    await mutate('DELETE', symbol);
    router.refresh();
    setPending(null);
  }

  async function handleAdd() {
    if (!toAdd) return;
    setPending(toAdd);
    await mutate('POST', toAdd);
    router.refresh();
    setPending(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {current.map((s) => (
        <div
          key={s.symbol}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            marginBottom: 8,
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="tabular" style={{ fontSize: 14, fontWeight: 600 }}>
              {s.symbol}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              {s.name} · {s.sector}
            </span>
          </div>
          <button
            onClick={() => handleRemove(s.symbol)}
            disabled={pending === s.symbol}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--down)',
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.02em',
              cursor: pending === s.symbol ? 'default' : 'pointer',
              opacity: pending === s.symbol ? 0.5 : 1,
            }}
          >
            Remove
          </button>
        </div>
      ))}

      {current.length === 0 && (
        <p style={{ color: 'var(--ink-muted)', fontSize: 14, padding: '24px 0' }}>
          Nothing on your watchlist yet.
        </p>
      )}

      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 24, alignItems: 'center' }}>
          <select
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value)}
            className="tabular"
            style={{
              flex: 1,
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
    </div>
  );
}
