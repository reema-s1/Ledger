/**
 * A small up/down trend glyph for scanning a card list at a glance,
 * colored by the same --up/--down tokens (and the same extracted
 * direction, see colorized-headline.tsx) as the headline text itself —
 * never a second, independent read of the move that could disagree.
 */
export function TrendIcon({ direction }: { direction: 'up' | 'down' }) {
  const color = direction === 'up' ? 'var(--up)' : 'var(--down)';
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {direction === 'up' ? (
        <>
          <polyline points="3 17 9.5 10.5 14 15 21 6" />
          <polyline points="21 12 21 6 15 6" />
        </>
      ) : (
        <>
          <polyline points="3 7 9.5 13.5 14 9 21 18" />
          <polyline points="21 11 21 18 15 18" />
        </>
      )}
    </svg>
  );
}
