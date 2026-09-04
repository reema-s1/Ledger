import { describe, it, expect } from 'vitest';
import { checkReassurance, DEFAULT_REASSURANCE_CONFIG } from '../../src/significance/reassurance';
import { decompose } from '../../src/significance/decompose';
import { evaluate } from '../../src/significance/engine';
import { buildScenario, noise, TEST_CONFIG } from './fixtures';

const DAYS = 40;
const NOISE_AMP = 0.008;
const BASE_INDEX_RETURNS = Array.from({ length: DAYS }, (_, i) => noise(i, 0.006, 0));

describe('checkReassurance', () => {
  it('fires for a large, market-driven move that the real engine correctly left unflagged', () => {
    // DAYS=41 is not special — it's just where this deterministic noise
    // sequence happens to land near residualZ=0 on the final day, so the
    // fixture is a clean "beta explains it" case rather than incidentally
    // tripping the residual gate. Found empirically (same approach as
    // engine.test.ts's fixtures), documented rather than left mysterious.
    const days = 41;
    const baseIndexReturns = Array.from({ length: days }, (_, i) => noise(i, 0.006, 0));
    const indexReturns = [...baseIndexReturns];
    indexReturns[days - 1] = -0.035; // a genuinely large market-wide drop
    const input = buildScenario({
      days,
      indexReturns,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      // no symbol override: the stock just tracks its (index-driven) cluster like every other day
    });

    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.observedReturn)).toBeGreaterThan(DEFAULT_REASSURANCE_CONFIG.noticeThreshold);
    expect(Math.abs(d.residualZ)).toBeLessThan(DEFAULT_REASSURANCE_CONFIG.residualZCeiling);
    expect(evaluate(input, TEST_CONFIG)).toBeNull(); // real engine correctly silent

    const result = checkReassurance('TCS', '2026-08-28', d, DEFAULT_REASSURANCE_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.explanation).toContain('So is the market');
    expect(result!.explanation).toContain('TCS');
  });

  it('does not fire when the move is too small to be a beginner-alarming headline number', () => {
    const indexReturns = [...BASE_INDEX_RETURNS];
    indexReturns[DAYS - 1] = -0.01; // small market move
    const input = buildScenario({
      days: DAYS,
      indexReturns,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
    });
    const d = decompose(input, TEST_CONFIG);
    expect(checkReassurance('TCS', '2026-08-28', d)).toBeNull();
  });

  it('does not fire for a real flagged event (large residual, not market-explained)', () => {
    const input = buildScenario({
      days: DAYS,
      indexReturns: BASE_INDEX_RETURNS,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      todaySymbolReturnOverride: 0.04, // isolated, symbol-specific move
      todayVolumeRatio: 2.0,
    });
    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.residualZ)).toBeGreaterThanOrEqual(TEST_CONFIG.residualZGate);
    expect(checkReassurance('TCS', '2026-08-28', d)).toBeNull();
  });

  it('does not fire for a sector-wide move when the market itself was flat (residual is low, but it is not "the market")', () => {
    const indexReturns = [...BASE_INDEX_RETURNS];
    indexReturns[DAYS - 1] = 0.001; // market flat
    const input = buildScenario({
      days: DAYS,
      indexReturns,
      clusterBeta: 1.0,
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
      todayClusterReturnOverride: 0.035, // sector-specific move, not index-driven
      // symbol tracks the (sector-moved) cluster, so residual stays low
    });
    const d = decompose(input, TEST_CONFIG);
    expect(Math.abs(d.residualZ)).toBeLessThan(TEST_CONFIG.residualZGate); // real engine silent
    // But it's the sector, not the market — the reassurance claim would be false.
    expect(checkReassurance('TCS', '2026-08-28', d)).toBeNull();
  });

  it('does not fire when the market moved one way but the stock moved the other', () => {
    const indexReturns = [...BASE_INDEX_RETURNS];
    indexReturns[DAYS - 1] = 0.035; // market up
    const input = buildScenario({
      days: DAYS,
      indexReturns,
      clusterBeta: -1.0, // deliberately inverted so the stock's cluster (and thus the stock) moves opposite the market
      clusterNoiseAmplitude: NOISE_AMP,
      symbolNoiseAmplitude: NOISE_AMP,
    });
    const d = decompose(input, TEST_CONFIG);
    expect(checkReassurance('TCS', '2026-08-28', d)).toBeNull();
  });
});
