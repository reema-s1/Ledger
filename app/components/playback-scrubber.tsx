'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DigestItem, DigestTier } from '../../src/digest/types';
import { DigestCard } from './digest-card';
import { SimpleDetailProvider } from './simple-detail-context';
import { SimpleDetailToggle } from './simple-detail-toggle';

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

const demoButtonStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--rule)',
  borderRadius: 999,
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink)',
  cursor: 'pointer',
};

export function PlaybackScrubber({
  sessionDates,
  eventDates = [],
  showExplain = false,
}: {
  sessionDates: string[];
  eventDates?: string[];
  showExplain?: boolean;
}) {
  const [index, setIndex] = useState(sessionDates.length - 1);
  const eventDateSet = new Set(eventDates);
  const nextEventIndex = sessionDates.findIndex((d, i) => i > index && eventDateSet.has(d));
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
    <SimpleDetailProvider>
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

      {/* A scripted, deterministic demo scenario: reset / advance / jump to
          the next real flagged event / exit — reusing this same real event
          log and clock rather than a separate system, so a repeatable
          walkthrough is just a fixed sequence of clicks on the real feature
          above, never a fabricated "inject event" that didn't happen. */}
      <div
        className="tabular"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <button onClick={() => setIndex(0)} disabled={index === 0} style={demoButtonStyle}>
          ↺ Reset
        </button>
        <button onClick={() => setIndex((i) => Math.min(sessionDates.length - 1, i + 1))} disabled={index >= sessionDates.length - 1} style={demoButtonStyle}>
          Advance +1 day
        </button>
        <button
          onClick={() => nextEventIndex !== -1 && setIndex(nextEventIndex)}
          disabled={nextEventIndex === -1}
          style={demoButtonStyle}
          title={nextEventIndex === -1 ? 'No further real flagged events on this watchlist' : `Jump to ${sessionDates[nextEventIndex]}`}
        >
          Next event →
        </button>
        <Link href="/" style={{ ...demoButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Exit to live digest
        </Link>
        <div style={{ marginLeft: 'auto' }}>
          <SimpleDetailToggle />
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
                <div>
                  {tierItems.map((item, i) => (
                    <DigestCard key={`${item.symbol}-${tier}-${i}`} item={item} showAck={false} showExplain={showExplain} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
    </SimpleDetailProvider>
  );
}
