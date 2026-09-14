'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { TriggeredThreshold } from '../../db/queries/watch-thresholds';
import { formatPct } from '../lib/format';

/**
 * A standalone bell, top-right of the content area on every page — not
 * tucked inside a nav link, so it's visible even if someone never
 * scrolls to or clicks the Watchlist item. Clicking it opens a small
 * card listing each triggered reminder (real numbers, not just a count);
 * clicking a row goes to /watchlist for the full detail. Still purely
 * passive by design (item 19's whole point): no push notification, no
 * popup outside the browser tab, nothing proactive — the card only ever
 * appears because someone clicked the bell themselves.
 *
 * Positioning is owned by the caller (app/layout.tsx's shared top-right
 * sticky bar, alongside the tour trigger) — this component only renders
 * the button and its dropdown, not its own page position.
 */
export function NotificationBell({ triggered }: { triggered: TriggeredThreshold[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = triggered.length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          data-tour="notification-bell"
          aria-label={count > 0 ? `${count} personal reminder${count > 1 ? 's' : ''} hit` : 'No personal reminders hit'}
          aria-expanded={open}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          🔔
          {count > 0 && (
            <span
              aria-hidden="true"
              className="tabular"
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 999,
                background: 'var(--accent-blue)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                border: '1.5px solid var(--bg)',
              }}
            >
              {count}
            </span>
          )}
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: 260,
              background: 'var(--surface)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Personal reminders
            </div>
            {count === 0 ? (
              <p style={{ margin: 0, padding: '14px', fontSize: 12.5, color: 'var(--ink-muted)' }}>
                Nothing hit right now. Set one from any symbol&rsquo;s row on the watchlist.
              </p>
            ) : (
              <div>
                {triggered.map((t, i) => (
                  <Link
                    key={t.symbol}
                    href="/watchlist"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      textDecoration: 'none',
                      color: 'var(--ink)',
                      borderBottom: i < triggered.length - 1 ? '1px solid var(--rule)' : 'none',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{t.symbol}</span>
                    <span className="tabular" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                      {formatPct(t.changePct)}
                      <span style={{ color: 'var(--ink-faint)' }}> · set ±{t.thresholdPct}%</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
