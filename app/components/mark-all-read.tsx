'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEMO_USER_ID } from '../../src/lib/demo-user';

export function MarkAllRead({ acks }: { acks: { symbol: string; upToEventId: number }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await Promise.all(
        acks.map((a) =>
          fetch('/api/cursor/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: DEMO_USER_ID,
              symbol: a.symbol,
              up_to_event_id: a.upToEventId,
              device_id: 'web',
            }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--accent-blue)',
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: '0.01em',
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.5 : 1,
        padding: 0,
      }}
    >
      {pending ? 'Marking read…' : 'Mark all read'}
    </button>
  );
}
