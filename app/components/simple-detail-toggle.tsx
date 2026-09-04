'use client';

import { useSimpleDetail } from './simple-detail-context';

/** Lives once in the digest header — never per-card. */
export function SimpleDetailToggle() {
  const [mode, setMode] = useSimpleDetail();

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
      {(['simple', 'detailed'] as const).map((option) => (
        <button
          key={option}
          onClick={() => setMode(option)}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 11.5,
            fontWeight: 600,
            textTransform: 'capitalize',
            cursor: 'pointer',
            background: mode === option ? 'var(--accent-soft)' : 'transparent',
            color: mode === option ? 'var(--up)' : 'var(--ink-faint)',
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
