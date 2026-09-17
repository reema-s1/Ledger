'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getClientUserId } from '../../src/lib/current-user-client';

/**
 * Item 19: a manual, personal reminder — "notify me if this moves more
 * than X%, regardless of significance." Deliberately styled with its own
 * icon and a neutral accent color, never --up/--down/--unconfirmed (the
 * significance engine's own palette), so it never reads as part of the
 * engine's judgment — a small personal sticky note, not a second scoring
 * system.
 */
export function PersonalThreshold({ symbol, thresholdPct, exceeded }: { symbol: string; thresholdPct: number | null; exceeded: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(thresholdPct ? String(thresholdPct) : '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct <= 0 || saving) return;
    setSaving(true);
    try {
      await fetch('/api/watch-threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: getClientUserId(), symbol, threshold_pct: pct }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      // Always cleared, even on a network failure — otherwise a dropped
      // request leaves the button disabled forever with no way back in,
      // which reads as "clicking does nothing."
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await fetch('/api/watch-threshold', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: getClientUserId(), symbol }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // Enter submits, matching the watchlist's own add-symbol field —
          // without this, a click on the small "set" text was the only
          // way in, and a press of Enter (the instinctive move after
          // typing a number) silently did nothing.
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="%"
          disabled={saving}
          autoFocus
          className="tabular no-spinner"
          style={{ width: 46, fontSize: 11, padding: '2px 4px', textAlign: 'center', border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--bg)', color: 'var(--ink)' }}
        />
        <button onClick={save} disabled={saving} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600, minWidth: 26 }}>
          {saving ? 'saving…' : 'set'}
        </button>
        {thresholdPct !== null && (
          <button onClick={clear} disabled={saving} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--ink-faint)', cursor: 'pointer' }}>
            clear
          </button>
        )}
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--ink-faint)', cursor: 'pointer' }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="tabular"
      title={
        thresholdPct !== null
          ? `Personal reminder — set to notify at ±${thresholdPct}% since you last checked this symbol, separate from the significance engine`
          : 'Set a personal move-size reminder, separate from significance'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
        background: 'none',
        border: `1px dashed ${exceeded ? 'var(--accent-blue)' : 'var(--rule)'}`,
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 10.5,
        color: exceeded ? 'var(--accent-blue)' : 'var(--ink-faint)',
        cursor: 'pointer',
        fontWeight: exceeded ? 700 : 500,
      }}
    >
      🔔 {thresholdPct !== null ? `±${thresholdPct}%${exceeded ? ' — hit' : ''}` : 'set reminder'}
    </button>
  );
}
