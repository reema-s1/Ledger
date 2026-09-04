'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DigestItem, DigestTier } from '../../src/digest/types';

interface ClusterRow {
  cluster_id: string;
  session_date: string;
  members: string[];
  method: string;
}

interface PlaybackResponse {
  date: string;
  items: DigestItem[];
  clusters: ClusterRow[];
}

const TIER_LABEL: Record<DigestTier, string> = { recent: 'Today', episode: 'This week', chapter: 'Earlier' };
const TIER_ORDER: DigestTier[] = ['recent', 'episode', 'chapter'];

const KIND_COLOR: Record<string, string> = {
  structural_break: 'var(--down)',
  corporate_action: 'var(--accent-blue)',
  resolved: 'var(--up)',
  residual_move: 'var(--unconfirmed)',
};

export function PlaybackScrubber({ sessionDates }: { sessionDates: string[] }) {
  const [index, setIndex] = useState(sessionDates.length - 1);
  const [data, setData] = useState<PlaybackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const date = sessionDates[index]!;

  useEffect(() => {
    const thisRequest = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/playback?date=${date}`)
        .then((res) => {
          if (!res.ok) throw new Error(`server returned ${res.status}`);
          return res.json() as Promise<PlaybackResponse>;
        })
        .then((body) => {
          if (requestId.current !== thisRequest) return; // stale response from a since-superseded scrub position
          setData(body);
          setError(null);
        })
        .catch(() => {
          if (requestId.current !== thisRequest) return;
          setError("Couldn't load this day — try scrubbing again.");
        })
        .finally(() => {
          if (requestId.current === thisRequest) setLoading(false);
        });
    }, 120); // debounce: don't fire a request per pixel while dragging

    return () => clearTimeout(timer);
  }, [date]);

  const grouped = new Map<DigestTier, DigestItem[]>();
  for (const tier of TIER_ORDER) grouped.set(tier, []);
  for (const item of data?.items ?? []) grouped.get(item.tier)!.push(item);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="tabular" style={{ fontSize: 18, fontWeight: 700 }}>
            {date}
          </span>
          <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
            day {index + 1} of {sessionDates.length}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={sessionDates.length - 1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span className="tabular" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
            {sessionDates[0]}
          </span>
          <button
            onClick={() => setIndex(sessionDates.length - 1)}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 10.5, color: 'var(--accent-blue)', cursor: 'pointer' }}
          >
            jump to latest
          </button>
          <span className="tabular" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
            {sessionDates[sessionDates.length - 1]}
          </span>
        </div>
      </div>

      {error && <p style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>{error}</p>}

      {!error && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s ease' }}>
          {data && data.clusters.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--ink-faint)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Clusters as of this day
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.clusters.map((c) => (
                  <p key={c.cluster_id} style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: 0 }}>
                    <span className="tabular" style={{ color: 'var(--ink-faint)' }}>
                      {c.cluster_id}
                    </span>{' '}
                    — {c.members.join(', ')}
                  </p>
                ))}
              </div>
            </section>
          )}

          {data && data.items.length === 0 && (
            <p style={{ fontSize: 14, color: 'var(--ink-muted)', padding: '20px 0' }}>
              Nothing had cleared the significance bar on your watchlist by this day.
            </p>
          )}

          {TIER_ORDER.map((tier) => {
            const tierItems = grouped.get(tier)!;
            if (tierItems.length === 0) return null;
            return (
              <section key={tier} style={{ marginBottom: 28 }}>
                <h2
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--ink-faint)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  {TIER_LABEL[tier]}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tierItems.map((item, i) => (
                    <div
                      key={`${item.symbol}-${tier}-${i}`}
                      style={{
                        padding: '14px 18px',
                        background: 'var(--surface)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: KIND_COLOR[item.kind] ?? 'var(--ink-faint)',
                            flexShrink: 0,
                          }}
                        />
                        <Link
                          href={`/symbol/${item.symbol}`}
                          className="tabular"
                          style={{ fontSize: 11, color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {item.symbol}
                        </Link>
                      </div>
                      <p style={{ fontSize: 14.5, margin: 0, color: 'var(--ink)' }}>{item.headline}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
