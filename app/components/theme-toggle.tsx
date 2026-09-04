'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'ledger:theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private-browsing/storage-blocked: the toggle still works for this
    // load, it just won't be remembered next visit.
  }
}

/**
 * Same pill pattern as SimpleDetailToggle. No shared React state with
 * other instances — each one reads the current theme straight off
 * data-theme on mount, which is safe because Nav and Landing never
 * render at the same time (one requires a session, the other requires
 * not having one), so there's never two toggles visible to fall out of
 * sync with each other.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setTheme(stored === 'light' || stored === 'dark' ? stored : getSystemTheme());
  }, []);

  if (theme === null) return null;

  function select(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid var(--rule)',
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {(['light', 'dark'] as const).map((option) => (
        <button
          key={option}
          onClick={() => select(option)}
          aria-label={`${option} mode`}
          aria-pressed={theme === option}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 11.5,
            fontWeight: 600,
            textTransform: 'capitalize',
            cursor: 'pointer',
            background: theme === option ? 'var(--accent-soft)' : 'transparent',
            color: theme === option ? 'var(--up)' : 'var(--ink-faint)',
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
