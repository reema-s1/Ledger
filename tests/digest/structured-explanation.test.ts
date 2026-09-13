import { describe, it, expect } from 'vitest';
import { buildStructuredExplanation, plainLanguageZ } from '../../src/digest/structured-explanation';
import type { Decomposition } from '../../src/significance/types';

function decomposition(overrides: Partial<Decomposition> = {}): Decomposition {
  return {
    observedReturn: 0.047,
    beta: 1.2,
    indexReturn: 0.01,
    clusterReturn: 0.003,
    clusterExcess: -0.009,
    residual: 0.047,
    residualZ: 4.7,
    volumeRatio: 1.8,
    volumeDataMissing: false,
    volumeWeightedZ: 4.7,
    correlationToCluster: 0.75,
    correlationHistoricalMin: 0.6,
    correlationHistoricalMax: 0.9,
    isStructuralBreak: false,
    ...overrides,
  };
}

describe('plainLanguageZ', () => {
  it('expresses a residual z-score as a multiple of normal daily range', () => {
    expect(plainLanguageZ(4.7)).toBe('4.7x this stock\'s normal daily range');
  });

  it('takes the absolute value — a negative move is still "Nx", not "-Nx"', () => {
    expect(plainLanguageZ(-3.2)).toBe('3.2x this stock\'s normal daily range');
  });
});

describe('buildStructuredExplanation', () => {
  it('produces exactly 4 lines, each with a distinct label', () => {
    const lines = buildStructuredExplanation(decomposition(), 'IT');
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((l) => l.label)).size).toBe(4);
  });

  it('discloses missing volume evidence honestly rather than fabricating a ratio', () => {
    const lines = buildStructuredExplanation(decomposition({ volumeDataMissing: true }), 'IT');
    const volumeLine = lines.find((l) => l.label === 'Volume')!;
    expect(volumeLine.text).toBe('not enough history to confirm');
  });

  it('states the residual and its z-score together, not as two separate lines', () => {
    const lines = buildStructuredExplanation(decomposition({ residual: 0.047, residualZ: 4.7 }), 'IT');
    const residualLine = lines.find((l) => l.label === 'Left over, unexplained')!;
    expect(residualLine.text).toContain('4.7%');
    expect(residualLine.text).toContain('4.7σ');
  });
});

describe('buildStructuredExplanation — locale (item 23)', () => {
  it('translates labels and phrasing into Hindi without touching any number', () => {
    const en = buildStructuredExplanation(decomposition({ residual: 0.047, residualZ: 4.7, volumeRatio: 1.8 }), 'IT', 'en');
    const hi = buildStructuredExplanation(decomposition({ residual: 0.047, residualZ: 4.7, volumeRatio: 1.8 }), 'IT', 'hi');

    expect(hi).toHaveLength(en.length);
    // Every real number that appears in the English version must appear
    // verbatim in the Hindi version — translation must never touch a
    // number the significance engine actually computed.
    expect(hi.map((l) => l.text).join(' ')).toContain('4.7%');
    expect(hi.map((l) => l.text).join(' ')).toContain('4.7σ');
    expect(hi.map((l) => l.text).join(' ')).toContain('1.8');
    // Labels are genuinely translated, not just copied through unchanged.
    for (let i = 0; i < en.length; i++) {
      expect(hi[i]!.label).not.toBe(en[i]!.label);
    }
  });

  it('discloses missing volume evidence honestly in Hindi too, not a fabricated ratio', () => {
    const lines = buildStructuredExplanation(decomposition({ volumeDataMissing: true }), 'IT', 'hi');
    const volumeLine = lines.find((l) => l.label === 'कारोबार की मात्रा')!;
    expect(volumeLine.text).toBe('पुष्टि के लिए पर्याप्त इतिहास नहीं');
  });

  it('defaults to English when no locale is given, unchanged from before item 23', () => {
    const lines = buildStructuredExplanation(decomposition(), 'IT');
    expect(lines[0]!.label).toBe('This move');
  });
});
