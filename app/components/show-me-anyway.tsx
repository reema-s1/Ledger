'use client';

import { useState } from 'react';
import { getClientUserId } from '../../src/lib/current-user-client';

interface QuietReason {
  symbol: string;
  sessionDate: string | null;
  residualZ: number | null;
  volumeRatio: number | null;
  clearedBar: boolean;
  zFraction: number | null;
  reason: string;
}

function barColor(r: QuietReason): string {
  if (r.clearedBar) return 'var(--down)';
  if ((r.zFraction ?? 0) >= 1) return 'var(--unconfirmed)'; // cleared the z-gate but not volume-confirmed
  if ((r.zFraction ?? 0) >= 0.6) return 'var(--accent-blue)';
  return 'var(--ink-faint)';
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
      const res = await fetch(`/api/why-quiet?user_id=${getClientUserId()}`);
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = (await res.json()) as { reasons: QuietReason[] };
      const sorted = [...data.reasons].sort((a, b) => (b.zFraction ?? -1) - (a.zFraction ?? -1));
      setReasons(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 8, width: '100%', maxWidth: 520 }}>
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
        <div style={{ marginTop: 18, textAlign: 'left' }}>
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
          {reasons?.map((r) => {
            const pct = Math.max(4, Math.min(100, (r.zFraction ?? 0) * 100));
            return (
              <div
                key={r.symbol}
                style={{
                  padding: '12px 16px',
                  marginBottom: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span className="tabular" style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {r.symbol}
                  </span>
                  {r.zFraction !== null && (
                    <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                      {r.zFraction.toFixed(2)}× the bar
                    </span>
                  )}
                </div>

                {r.zFraction !== null && (
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: 'var(--rule)',
                      overflow: 'hidden',
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: barColor(r),
                        borderRadius: 2,
                      }}
                    />
                  </div>
                )}

                <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: 0, lineHeight: 1.4 }}>
                  {r.reason}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
