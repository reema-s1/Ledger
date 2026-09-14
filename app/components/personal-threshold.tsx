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
    if (!Number.isFinite(pct) || pct <= 0) return;
    setSaving(true);
    await fetch('/api/watch-threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getClientUserId(), symbol, threshold_pct: pct }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function clear() {
    setSaving(true);
    await fetch('/api/watch-threshold', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getClientUserId(), symbol }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
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
          placeholder="%"
          className="tabular no-spinner"
          style={{ width: 46, fontSize: 11, padding: '2px 4px', textAlign: 'center', border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--bg)', color: 'var(--ink)' }}
        />
        <button onClick={save} disabled={saving} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>
          set
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
      title={thresholdPct !== null ? `Personal reminder — set to notify at ±${thresholdPct}%, separate from the significance engine` : 'Set a personal move-size reminder, separate from significance'}
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
      🔔 {thresholdPct !== null ? `±${thresholdPct}%${exceeded ? ' — hit today' : ''}` : 'set reminder'}
    </button>
  );
}
