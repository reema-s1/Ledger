import { getDataMode } from '../../src/lib/data-mode';
import { countIngestedSessionDates } from '../../db/queries/candles';

/**
 * A hidden fact (which DATA_MODE is live) made visible everywhere,
 * not just on /system — DB-only (no seed-dataset file read), so it's
 * safe to render from the root layout on every route without widening
 * next.config.mjs's outputFileTracingIncludes beyond /api and /system.
 *
 * Rendered directly by the root layout (not a nested route segment), so
 * app/error.tsx can't catch anything this throws — a DB hiccup here must
 * never take down every page just to show a footer tag.
 */
export async function DataModeTag() {
  const mode = getDataMode();
  let ingestedDays: number | null = null;
  if (mode === 'replay') {
    try {
      ingestedDays = await countIngestedSessionDates();
    } catch {
      ingestedDays = null;
    }
  }

  return (
    <footer style={{ padding: '20px 24px 32px', textAlign: 'center' }}>
      <span
        className="tabular"
        style={{
          fontSize: 10.5,
          color: 'var(--ink-faint)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {mode === 'replay' ? `Replay mode${ingestedDays ? ` · day ${ingestedDays}` : ''}` : 'Live mode'}
      </span>
    </footer>
  );
}
