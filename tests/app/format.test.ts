import { describe, it, expect } from 'vitest';
import { formatRangeWindowLabel } from '../../app/lib/format';

describe('formatRangeWindowLabel', () => {
  it('labels a short window in days', () => {
    expect(formatRangeWindowLabel('2026-08-01', '2026-08-31')).toBe('30D range');
  });

  it('labels a multi-month window in months, not a misleading "52W"', () => {
    // ~220 real trading sessions is roughly 10 real calendar months, not a year
    expect(formatRangeWindowLabel('2025-10-21', '2026-09-11')).toBe('~11mo range');
  });

  it('labels a window at or past a year as 1Y, not a false-precision month count', () => {
    expect(formatRangeWindowLabel('2025-01-01', '2026-01-05')).toBe('~1Y range');
  });

  it('never claims "52W" for a window that does not actually span a year', () => {
    const label = formatRangeWindowLabel('2026-01-01', '2026-06-01');
    expect(label).not.toContain('52W');
    expect(label).not.toContain('1Y');
  });
});
