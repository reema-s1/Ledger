'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

interface AskLogEvent {
  id: number;
  symbol: string;
  kind: string;
  ts: string;
  explanation: string | null;
  significance: number | null;
}

/**
 * A quiet input-and-answer block, not a chat interface — one question,
 * one answer, sources shown right below it so the answer is traceable
 * back to real events, not a black box. Retrieval only (src/lib/ask-
 * log.ts): every word in the answer already existed in the events
 * table before this component ran.
 */
export function AskLog() {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AskLogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!res.ok) {
        setAnswer(null);
        setSources([]);
        setError("Couldn't answer that one — try rephrasing.");
        return;
      }
      const data = (await res.json()) as { answer: string; events: AskLogEvent[] };
      setAnswer(data.answer);
      setSources(data.events.slice(0, 4));
    } catch {
      setAnswer(null);
      setSources([]);
      setError("Couldn't reach the server — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--rule)' }}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--ink-faint)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Ask the log
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why is my portfolio red today?"
          maxLength={300}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 13.5,
          }}
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontWeight: 600,
            fontSize: 13.5,
            cursor: pending || !question.trim() ? 'default' : 'pointer',
            opacity: pending || !question.trim() ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {pending ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 14 }}>{error}</p>
      )}

      {answer && !error && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0, color: 'var(--ink)' }}>{answer}</p>

          {sources.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sources.map((s) => (
                <p key={s.id} style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 }}>
                  <Link href={`/symbol/${s.symbol}`} style={{ color: 'var(--ink-faint)', textDecoration: 'underline' }}>
                    {s.symbol}
                  </Link>
                  {' — '}
                  {s.explanation ?? 'flagged, no explanation stored'}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
