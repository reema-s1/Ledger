/**
 * A multi-line breakdown of a decomposition already computed by the
 * significance engine (src/significance/decompose.ts) and stored on the
 * event's payload — this module does no new computation of its own, it
 * only re-presents the same numbers `buildExplanation` (explain.ts)
 * already turns into one sentence, as a short structured list instead:
 * the move itself, what the market/cluster explains, the leftover
 * residual and why it's unusual for this specific stock, and the volume
 * context. Read-path formatting, same category as compact.ts/why-quiet.ts
 * — not the scoring engine itself.
 *
 * Item 23: locale support is template translation only — the numbers
 * themselves (percentages, σ, ratios) are never translated or
 * recomputed, only the words around them. Deliberately not an LLM call:
 * a fixed phrase table can't introduce its own interpretation of what
 * the numbers mean, which a translation model in principle could.
 */

import type { Decomposition } from '../significance/types';

export type ExplanationLocale = 'en' | 'hi';

interface Phrases {
  up: string;
  down: string;
  flat: string;
  labels: {
    move: string;
    explainedBy: string;
    leftover: string;
    volume: string;
  };
  market: string;
  volumeUnconfirmed: string;
  volumeNormalSuffix: string;
  zSuffix: string;
}

const PHRASES: Record<ExplanationLocale, Phrases> = {
  en: {
    up: 'up',
    down: 'down',
    flat: 'flat',
    labels: {
      move: 'This move',
      explainedBy: 'Explained by market + cluster',
      leftover: 'Left over, unexplained',
      volume: 'Volume',
    },
    market: 'market',
    volumeUnconfirmed: 'not enough history to confirm',
    volumeNormalSuffix: 'x normal',
    zSuffix: "x this stock's normal daily range",
  },
  hi: {
    up: 'ऊपर',
    down: 'नीचे',
    flat: 'सपाट',
    labels: {
      move: 'यह बदलाव',
      explainedBy: 'बाज़ार + समूह से स्पष्ट',
      leftover: 'शेष, अस्पष्ट हिस्सा',
      volume: 'कारोबार की मात्रा',
    },
    market: 'बाज़ार',
    volumeUnconfirmed: 'पुष्टि के लिए पर्याप्त इतिहास नहीं',
    volumeNormalSuffix: 'x सामान्य',
    zSuffix: 'x इस स्टॉक की सामान्य दैनिक सीमा',
  },
};

function describeMove(returnValue: number, locale: ExplanationLocale, flatEps = 0.001): string {
  const p = PHRASES[locale];
  if (Math.abs(returnValue) < flatEps) return p.flat;
  const dir = returnValue > 0 ? p.up : p.down;
  const pct = (Math.abs(returnValue) * 100).toFixed(1);
  return locale === 'hi' ? `${pct}% ${dir}` : `${dir} ${pct}%`;
}

/**
 * The same z-score expressed in plain language instead of a Greek letter
 * — "2.4x this stock's normal daily range" is the same number as "2.4σ",
 * just spelled out for someone who doesn't already read z-scores fluently.
 */
export function plainLanguageZ(residualZ: number, locale: ExplanationLocale = 'en'): string {
  const abs = Math.abs(residualZ).toFixed(1);
  return `${abs}${PHRASES[locale].zSuffix}`;
}

export interface StructuredExplanationLine {
  label: string;
  text: string;
}

/**
 * 2-4 short lines, one idea each. Never more than one line references the
 * same underlying number twice — "residual" and "why it's unusual" are
 * combined into a single line (the residual size *is* the input to the
 * z-score), matching the brief's "2-4 short lines" cap rather than
 * padding out to one line per available field.
 */
export function buildStructuredExplanation(
  d: Decomposition,
  clusterLabel = 'its cluster',
  locale: ExplanationLocale = 'en',
): StructuredExplanationLine[] {
  const p = PHRASES[locale];
  const zAbs = Math.abs(d.residualZ).toFixed(1);

  return [
    { label: p.labels.move, text: describeMove(d.observedReturn, locale) },
    {
      label: p.labels.explainedBy,
      text: `${p.market} ${describeMove(d.indexReturn, locale)}, ${clusterLabel} ${describeMove(d.clusterReturn, locale)}`,
    },
    {
      label: p.labels.leftover,
      text: `${describeMove(d.residual, locale)} — ${plainLanguageZ(d.residualZ, locale)} (${zAbs}σ)`,
    },
    {
      label: p.labels.volume,
      text: d.volumeDataMissing ? p.volumeUnconfirmed : `${d.volumeRatio.toFixed(1)}${p.volumeNormalSuffix}`,
    },
  ];
}
