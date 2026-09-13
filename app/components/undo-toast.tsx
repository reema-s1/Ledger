'use client';

import { useEffect } from 'react';

export interface UndoState {
  message: string;
  onUndo: () => void;
}

const AUTO_DISMISS_MS = 6000;

/**
 * Item 21: explicit undo on watchlist add/remove. Undoing an add just
 * deletes the row outright (a freshly-added symbol has no cursor/
 * threshold data yet — nothing to restore). Undoing a remove re-adds the
 * row; since removeFromWatchlist never touches read_cursors/
 * watch_thresholds (see db/queries/watchlist.ts), the symbol's prior
 * cursor position and any personal threshold are still there untouched —
 * a real restore, not a fabricated one.
 */
export function UndoToast({ state, onDismiss }: { state: UndoState | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state, onDismiss]);

  if (!state) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--ink)',
        color: 'var(--bg)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow)',
        fontSize: 13,
        zIndex: 100,
      }}
    >
      <span>{state.message}</span>
      <button
        onClick={() => {
          state.onUndo();
          onDismiss();
        }}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
      >
        Undo
      </button>
    </div>
  );
}
