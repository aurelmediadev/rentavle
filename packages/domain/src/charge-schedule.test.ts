import { describe, expect, it } from 'vitest';
import { dueDate, recurringMonthsDue, recurringServiceMonth, rentForMonth, rentMonthsDue } from './charge-schedule';
import { formatYearMonth, parseYearMonth as ym } from './year-month';

const fmt = (list: { year: number; month: number }[]) => list.map(formatYearMonth);

describe('rent months', () => {
  it('generates from the first billed month up to the current month', () => {
    expect(fmt(rentMonthsDue({ firstBilledMonth: ym('2026-08'), endMonth: ym('2029-03'), upTo: ym('2026-10') }))).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('stops at the end of the contract', () => {
    expect(fmt(rentMonthsDue({ firstBilledMonth: ym('2026-11'), endMonth: ym('2026-12'), upTo: ym('2027-03') }))).toEqual([
      '2026-11',
      '2026-12',
    ]);
  });

  it('is empty before the first billed month', () => {
    expect(rentMonthsDue({ firstBilledMonth: ym('2027-01'), endMonth: ym('2028-12'), upTo: ym('2026-10') })).toEqual([]);
  });

  it('uses the due day of the month', () => {
    expect(dueDate(ym('2026-10'), 10)).toBe('2026-10-10');
    expect(() => dueDate(ym('2026-10'), 31)).toThrow(RangeError);
  });
});

describe('rent amount', () => {
  const periods = [
    { startMonth: ym('2026-04'), endMonth: ym('2026-09'), amount: '500000.00' },
    { startMonth: ym('2026-10'), endMonth: ym('2027-03'), amount: null },
    { startMonth: ym('2027-04'), endMonth: ym('2027-09'), amount: null },
  ];

  it('uses the period amount when known', () => {
    expect(rentForMonth(periods, ym('2026-06'))).toEqual({ amount: '500000.00', confirmed: true });
  });

  it('falls back to the last known amount, unconfirmed', () => {
    expect(rentForMonth(periods, ym('2026-10'))).toEqual({ amount: '500000.00', confirmed: false });
    expect(rentForMonth(periods, ym('2027-05'))).toEqual({ amount: '500000.00', confirmed: false });
  });

  it('returns null outside the contract or without any amount', () => {
    expect(rentForMonth(periods, ym('2026-03'))).toBeNull();
    expect(rentForMonth([{ startMonth: ym('2026-01'), endMonth: ym('2026-06'), amount: null }], ym('2026-02'))).toBeNull();
  });
});

describe('recurring charges', () => {
  const expensas = { startMonth: ym('2026-10'), endMonth: null, frequencyMonths: 1, timing: 'in_advance' as const };

  it('bills monthly in advance in the service month', () => {
    expect(recurringServiceMonth(expensas, ym('2026-09'))).toBeNull();
    expect(formatYearMonth(recurringServiceMonth(expensas, ym('2026-10'))!)).toBe('2026-10');
  });

  it('bills in arrears the month after the service', () => {
    const luz = { ...expensas, timing: 'in_arrears' as const };
    expect(recurringServiceMonth(luz, ym('2026-10'))).toBeNull();
    expect(formatYearMonth(recurringServiceMonth(luz, ym('2026-11'))!)).toBe('2026-10');
  });

  it('respects the frequency and the end month', () => {
    const abl = { startMonth: ym('2026-01'), endMonth: ym('2026-12'), frequencyMonths: 2, timing: 'in_advance' as const };
    const due = recurringMonthsDue(abl, ym('2026-01'), ym('2027-02'));
    expect(due.map((d) => formatYearMonth(d.billingMonth))).toEqual(['2026-01', '2026-03', '2026-05', '2026-07', '2026-09', '2026-11']);
  });
});
