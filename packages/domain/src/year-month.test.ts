import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compareYearMonth,
  formatYearMonth,
  monthRange,
  monthsBetween,
  parseYearMonth,
  yearMonthOfDate,
} from './year-month';

describe('year-month', () => {
  it('parses and formats', () => {
    expect(formatYearMonth(parseYearMonth('2026-10'))).toBe('2026-10');
    expect(formatYearMonth(yearMonthOfDate('2026-04-01'))).toBe('2026-04');
    expect(() => parseYearMonth('2026-13')).toThrow(RangeError);
    expect(() => parseYearMonth('26-10')).toThrow(RangeError);
  });

  it('adds months across years in both directions', () => {
    expect(formatYearMonth(addMonths(parseYearMonth('2026-11'), 3))).toBe('2027-02');
    expect(formatYearMonth(addMonths(parseYearMonth('2026-01'), -1))).toBe('2025-12');
  });

  it('counts the installments of a 3-year contract', () => {
    const start = parseYearMonth('2026-04');
    const end = parseYearMonth('2029-03');
    expect(monthsBetween(start, end) + 1).toBe(36);
    // October 2026 is installment 7 of 36, as shown on receipts.
    expect(monthsBetween(start, parseYearMonth('2026-10')) + 1).toBe(7);
  });

  it('builds inclusive ranges and compares', () => {
    const range = monthRange(parseYearMonth('2026-11'), parseYearMonth('2027-01')).map(formatYearMonth);
    expect(range).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthRange(parseYearMonth('2027-01'), parseYearMonth('2026-01'))).toEqual([]);
    expect(compareYearMonth(parseYearMonth('2026-10'), parseYearMonth('2026-09'))).toBe(1);
  });
});
