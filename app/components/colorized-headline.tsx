/**
 * Colors the subject's own move (never a comparison — "the market was
 * down 0.2%" stays plain) inside a plain-sentence headline. Every
 * headline template puts the subject's move first — src/significance/
 * explain.ts and worker/stale-alerts.ts both lead with it — so matching
 * only the *first* direction+percentage pair in the string is enough to
 * get the right one without needing to know which kind of sentence this
 * is.
 */
const DIRECTION_PATTERN = /\b(up|down|spiked|dropped)\s+([\d.]+%)/i;

export function ColorizedHeadline({ text }: { text: string }) {
  const match = DIRECTION_PATTERN.exec(text);
  if (!match) return <>{text}</>;

  const full = match[0];
  const direction = match[1]!.toLowerCase();
  const isPositive = direction === 'up' || direction === 'spiked';
  const start = match.index;
  const end = start + full.length;

  return (
    <>
      {text.slice(0, start)}
      <span style={{ color: isPositive ? 'var(--up)' : 'var(--down)', fontWeight: 700 }}>{full}</span>
      {text.slice(end)}
    </>
  );
}
