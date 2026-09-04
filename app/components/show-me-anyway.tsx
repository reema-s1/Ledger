'use client';

import { useState } from 'react';
import { DEMO_USER_ID } from '../../src/lib/demo-user';

interface QuietReason {
  symbol: string;
  sessionDate: string | null;
  residualZ: number | null;
  volumeRatio: number | null;
  clearedBar: boolean;
  reason: string;
}

export function ShowMeAnyway() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<QuietReason[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (reasons) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/why-quiet?user_id=${DEMO_USER_ID}`);
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = (await res.json()) as { reasons: QuietReason[] };
      setReasons(data.reasons);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 8, width: '100%', maxWidth: 480 }}>
      <button
        onClick={handleToggle}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent-blue)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {open ? 'Hide the numbers' : 'Show me anyway'}
      </button>

      {open && (
        <div style={{ marginTop: 16, textAlign: 'left' }}>
          {loading && (
            <p className="tabular" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              computing…
            </p>
          )}
          {error && (
            <p className="tabular" style={{ fontSize: 12, color: 'var(--down)' }}>
              couldn't load this — {error}
            </p>
          )}
          {reasons?.map((r) => (
            <div
              key={r.symbol}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                marginBottom: 6,
                background: 'var(--surface)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span className="tabular" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {r.symbol}
              </span>
              <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {r.reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
