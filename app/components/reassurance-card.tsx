import Link from 'next/link';
import type { ReassuranceCard as ReassuranceCardData } from '../../src/digest/reassurance-cards';
import { AckButton } from './ack-button';

/**
 * Deliberately quieter than a flagged-event card: no colored kind dot,
 * lighter weight text, no surface/border box — reads as "context," never
 * competes visually with a real alert above it.
 */
export function ReassuranceCard({ card }: { card: ReassuranceCardData }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        padding: '10px 4px',
      }}
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0, color: 'var(--ink-muted)' }}>
        <Link href={`/symbol/${card.symbol}`} style={{ color: 'var(--ink-muted)', textDecoration: 'underline' }}>
          {card.symbol}
        </Link>
        {' — '}
        {card.headline}
      </p>
      <div style={{ flexShrink: 0, paddingTop: 3 }}>
        <AckButton symbol={card.symbol} upToEventId={card.eventId} label="OK" quiet />
      </div>
    </div>
  );
}
