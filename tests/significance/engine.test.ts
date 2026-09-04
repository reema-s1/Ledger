import { describe, it, expect } from 'vitest';
import { decompose } from '../../src/significance/decompose';
import { evaluate } from '../../src/significance/engine';
import { buildScenario, noise, TEST_CONFIG } from './fixtures';

const DAYS = 40;
const NOISE_AMP = 0.008; // ~0.8% daily idiosyncratic noise, a realistic baseline
const BASE_INDEX_RETURNS = Array.from({ length: DAYS }, (_, i) => noise(i, 0.006, 0));

describe('significance engine', () => {
  it('does not flag a pure beta move (whole market moved, symbol tracked it like always)', () => {
    const indexReturns = [...BASE_INDEX_RETURNS];
    indexReturns[DAYS - 1] = 0.03; // a strong market-wide day
    const input = buildScenario({
      days: DAYS,
      indexReturns,
      clusterBeta: 1.1,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      // no override: symbol keeps tracking its cluster exactly as every other day
    });

    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.residualZ)).toBeLessThan(TEST_CONFIG.residualZGate);
    expect(evaluate(input, TEST_CONFIG)).toBeNull();
  });

  it('does not flag a pure sector move (cluster moved on its own, symbol moved with it)', () => {
    const indexReturns = [...BASE_INDEX_RETURNS];
    indexReturns[DAYS - 1] = 0.001; // market itself flat
    const input = buildScenario({
      days: DAYS,
      indexReturns,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      todayClusterReturnOverride: 0.025, // sector-specific move, not index-driven
      // no symbol override: symbol tracks the (moved) cluster exactly as every other day
    });

    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.residualZ)).toBeLessThan(TEST_CONFIG.residualZGate);
    expect(evaluate(input, TEST_CONFIG)).toBeNull();
  });

  it('flags an isolated residual move on confirmed volume', () => {
    const input = buildScenario({
      days: DAYS,
      indexReturns: BASE_INDEX_RETURNS,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      todaySymbolReturnOverride: 0.008, // symbol-specific move, cluster/index unaffected
      todayVolumeRatio: 2.0,
    });

    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.residualZ)).toBeGreaterThanOrEqual(TEST_CONFIG.residualZGate);
    expect(d.isStructuralBreak).toBe(false);

    const result = evaluate(input, TEST_CONFIG, 'IT');
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('residual_move');
    expect(result!.explanation.length).toBeGreaterThan(0);
  });

  it('does not flag the same isolated residual on thin volume', () => {
    const input = buildScenario({
      days: DAYS,
      indexReturns: BASE_INDEX_RETURNS,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      todaySymbolReturnOverride: 0.008, // same residual as the confirmed-volume case above
      todayVolumeRatio: 0.15, // but on a fifth of normal volume
    });

    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.residualZ)).toBeGreaterThanOrEqual(TEST_CONFIG.residualZGate); // the move itself is still unusual...
    expect(d.volumeWeightedZ).toBe(0); // ...but volume confirmation kills the score outright
    expect(evaluate(input, TEST_CONFIG)).toBeNull();
  });

  it('flags a correlation breakdown as a structural break, not a plain residual move', () => {
    const input = buildScenario({
      days: DAYS,
      indexReturns: BASE_INDEX_RETURNS,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      todaySymbolReturnOverride: 0.03, // large enough to also dominate the correlation window
      todayVolumeRatio: 2.0,
    });

    const d = decompose(input, TEST_CONFIG);
    expect(d.correlationToCluster).toBeLessThan(d.correlationHistoricalMin - TEST_CONFIG.breakCorrelationDrop);
    expect(d.isStructuralBreak).toBe(true);

    const result = evaluate(input, TEST_CONFIG, 'IT');
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('structural_break');
    expect(result!.explanation).toContain('broke from');
  });

  it('throws on mismatched input lengths rather than silently computing garbage', () => {
    const input = buildScenario({
      days: DAYS,
      indexReturns: BASE_INDEX_RETURNS,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
    });
    const broken = { ...input, clusterReturns: input.clusterReturns.slice(1) };
    expect(() => decompose(broken, TEST_CONFIG)).toThrow();
  });
});
