'use client';

import { useState } from 'react';

interface CorrelationsResponse {
  method: 'sector' | 'correlation' | null;
  note?: string;
  correlations: { peer: string; correlation: number }[];
}

export function WhyGrouped({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CorrelationsResponse | null>(null);

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cluster-correlations?symbol=${symbol}`);
      setData((await res.json()) as CorrelationsResponse);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={handleToggle}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent-blue)',
          fontWeight: 600,
          fontSize: 12.5,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {open ? 'Hide correlations' : 'Why grouped?'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && (
            <p className="tabular" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              computing…
            </p>
          )}
          {data?.note && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: 0 }}>{data.note}</p>
          )}
          {data?.correlations.map((c) => (
            <div
              key={c.peer}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--rule)',
                fontSize: 12.5,
              }}
            >
              <span style={{ fontWeight: 500 }}>{c.peer}</span>
              <span className="tabular" style={{ color: c.correlation >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {c.correlation >= 0 ? '+' : ''}
                {c.correlation.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
