'use client';

import { useState } from 'react';

interface ExplainResult {
  found: boolean;
  hypothesis: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  error?: string;
}

type ExplainState = 'idle' | 'pending' | 'done';

/**
 * "Find possible explanation" (llm-addition.md) — a supplementary,
 * on-demand lookup, visually and functionally secondary to the
 * deterministic significance explanation above it. Never runs unless
 * clicked; never blocks or degrades the card if it fails. Split from
 * rendering (below) so the trigger can sit in the card's narrow button
 * column while the result renders full-width beneath the card's content.
 */
export function useExplainLookup(eventId: number) {
  const [state, setState] = useState<ExplainState>('idle');
  const [result, setResult] = useState<ExplainResult | null>(null);

  async function run() {
    setState('pending');
    try {
      const res = await fetch(`/api/events/${eventId}/explain`, { method: 'POST' });
      const data = (await res.json()) as ExplainResult;
      setResult(res.ok ? data : { found: false, hypothesis: null, sourceUrl: null, sourceTitle: null, error: 'lookup-failed' });
    } catch {
      setResult({ found: false, hypothesis: null, sourceUrl: null, sourceTitle: null, error: 'lookup-failed' });
    } finally {
      setState('done');
    }
  }

  return { state, result, run };
}

export function ExplainTrigger({ state, onClick }: { state: ExplainState; onClick: () => void }) {
  if (state === 'pending') {
    return <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Checking…</span>;
  }
  if (state === 'done') return null;
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: '1px solid var(--rule)',
        borderRadius: 999,
        color: 'var(--ink-faint)',
        fontSize: 11,
        fontWeight: 500,
        padding: '4px 10px',
        cursor: 'pointer',
      }}
    >
      Find possible explanation
    </button>
  );
}

export function ExplainResultBlock({ state, result }: { state: ExplainState; result: ExplainResult | null }) {
  if (state !== 'done') return null;

  if (result?.found) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          background: 'var(--bg)',
          border: '1px dashed var(--rule)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--ink-faint)', marginBottom: 4 }}>
          POSSIBLE EXPLANATION (UNVERIFIED)
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 6px', lineHeight: 1.5 }}>{result.hypothesis}</p>
        {result.sourceUrl && (
          <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: 'var(--accent-blue)' }}>
            {result.sourceTitle ?? 'Source'}
          </a>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
        {result?.error ? "Couldn't check right now — try again." : 'No related news found.'}
      </span>
    </div>
  );
}
