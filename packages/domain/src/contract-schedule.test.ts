import { describe, expect, it } from 'vitest';
import {
  defaultFirstBilledMonth,
  durationLabel,
  installmentCount,
  installmentNumber,
  planPeriods,
  updatePeriods,
} from './contract-schedule';
import { formatYearMonth, parseYearMonth } from './year-month';

const threeYears = { startDate: '2026-04-01', endDate: '2029-03-31' };
const fmt = (p: { number: number; startMonth: { year: number; month: number }; endMonth: { year: number; month: number } }) =>
  `${p.number}:${formatYearMonth(p.startMonth)}..${formatYearMonth(p.endMonth)}`;

describe('installments', () => {
  it('counts monthly installments and labels the duration', () => {
    expect(installmentCount(threeYears)).toBe(36);
    expect(durationLabel(threeYears)).toBe('3 años');
    expect(durationLabel({ startDate: '2026-01-01', endDate: '2027-06-30' })).toBe('18 meses');
    expect(durationLabel({ startDate: '2026-01-01', endDate: '2026-12-31' })).toBe('1 año');
  });

  it('numbers installments like receipts do ("7/36")', () => {
    expect(installmentNumber(threeYears, parseYearMonth('2026-10'))).toBe(7);
    expect(installmentNumber(threeYears, parseYearMonth('2026-03'))).toBeNull();
    expect(installmentNumber(threeYears, parseYearMonth('2029-04'))).toBeNull();
  });

  it('rejects contracts that end before they start', () => {
    expect(() => installmentCount({ startDate: '2026-04-01', endDate: '2026-03-01' })).toThrow(RangeError);
  });
});

describe('update periods', () => {
  it('splits a 3-year contract in semesters (as Krenta showed)', () => {
    expect(updatePeriods(threeYears, 6).map(fmt)).toEqual([
      '1:2026-04..2026-09',
      '2:2026-10..2027-03',
      '3:2027-04..2027-09',
      '4:2027-10..2028-03',
      '5:2028-04..2028-09',
      '6:2028-10..2029-03',
    ]);
  });

  it('cuts the last period at the end of the contract', () => {
    const term = { startDate: '2026-01-01', endDate: '2027-02-28' };
    expect(updatePeriods(term, 4).map(fmt)).toEqual([
      '1:2026-01..2026-04',
      '2:2026-05..2026-08',
      '3:2026-09..2026-12',
      '4:2027-01..2027-02',
    ]);
  });

  it('uses one period when there are no updates', () => {
    expect(updatePeriods(threeYears, null).map(fmt)).toEqual(['1:2026-04..2029-03']);
  });
});

describe('contracts loaded in progress', () => {
  it('starts billing in the current month and keeps that period as initial', () => {
    const first = defaultFirstBilledMonth(threeYears, parseYearMonth('2026-10'));
    expect(formatYearMonth(first)).toBe('2026-10');
    expect(planPeriods(threeYears, 6, first).map((p) => p.status)).toEqual([
      'not_billed',
      'initial',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('bills from the start for future contracts', () => {
    const first = defaultFirstBilledMonth(threeYears, parseYearMonth('2026-01'));
    expect(formatYearMonth(first)).toBe('2026-04');
    expect(planPeriods(threeYears, 6, first)[0]?.status).toBe('initial');
  });

  it('handles a first billed month in the middle of a period', () => {
    const plan = planPeriods(threeYears, 6, parseYearMonth('2026-12'));
    expect(plan.map((p) => p.status).slice(0, 3)).toEqual(['not_billed', 'initial', 'pending']);
  });
});
