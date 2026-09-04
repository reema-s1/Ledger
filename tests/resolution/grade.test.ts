import { describe, it, expect } from 'vitest';
import { gradeResolution } from '../../src/resolution/grade';

describe('gradeResolution', () => {
  it('grades "held" when the move is still fully there', () => {
    const g = gradeResolution('WIPRO', 'structural break', 100, 106, 105.5); // ~92% retained
    expect(g.outcome).toBe('held');
    expect(g.retainedFraction).toBeGreaterThanOrEqual(0.75);
    expect(g.explanation).toContain('still diverged');
  });

  it('grades "reverted" when the move is fully gone', () => {
    const g = gradeResolution('WIPRO', 'unusual move', 100, 106, 100.2); // ~3% retained
    expect(g.outcome).toBe('reverted');
    expect(g.explanation).toContain('fully reverted');
  });

  it('grades "partially_reverted" in between', () => {
    const g = gradeResolution('WIPRO', 'unusual move', 100, 106, 103); // 50% retained
    expect(g.outcome).toBe('partially_reverted');
    expect(g.explanation).toContain('partially reverted');
  });

  it('handles a downward original move the same way', () => {
    const g = gradeResolution('WIPRO', 'unusual move', 100, 94, 94.3); // held, still down
    expect(g.outcome).toBe('held');
    expect(g.explanation).toContain('down');
  });

  it('treats overshoot past baseline (negative retainedFraction) as reverted, not a crash', () => {
    const g = gradeResolution('WIPRO', 'unusual move', 100, 106, 98); // went past baseline the other way
    expect(g.retainedFraction).toBeLessThan(0);
    expect(g.outcome).toBe('reverted');
  });

  it('does not divide by zero when there was no original move', () => {
    const g = gradeResolution('WIPRO', 'unusual move', 100, 100, 105);
    expect(g.outcome).toBe('held');
    expect(Number.isFinite(g.retainedFraction)).toBe(true);
  });

  it('sits exactly at the held/partially_reverted boundary as held (inclusive)', () => {
    const g = gradeResolution('WIPRO', 'unusual move', 100, 108, 106); // exactly 0.75 retained
    expect(g.outcome).toBe('held');
  });
});
