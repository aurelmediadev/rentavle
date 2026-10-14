import { describe, expect, it } from 'vitest';
import { type IndexLookup, computeFixedUpdate, computeIndexUpdate, monthlyWindow } from './rent-update';
import { formatYearMonth, parseYearMonth } from './year-month';

/** Published IPC levels (INDEC, base dic-2016) used as fixture. */
const IPC: Record<string, string> = {
  '2026-02-01': '10712.0000',
  '2026-03-01': '11000.0000',
  '2026-04-01': '11363.0904',
  '2026-05-01': '11607.3937',
  '2026-06-01': '11826.4103',
  '2026-07-01': '12076.3937',
  '2026-08-01': '12276.7660',
};
const ipcLookup: IndexLookup = (date) => (IPC[date] ? { date, value: IPC[date]! } : null);

const ipc = { method: 'level_ratio', frequency: 'monthly' } as const;

describe('monthly window', () => {
  it('uses the month two months before the update with real values', () => {
    // Quarterly update in April 2026 uses Nov-2025 → Feb-2026 (as Krenta's template shows).
    const w = monthlyWindow({ periodStart: parseYearMonth('2026-04'), previousPeriodStart: parseYearMonth('2026-01'), mode: 'real' });
    expect([formatYearMonth(w.startMonth), formatYearMonth(w.endMonth)]).toEqual(['2025-11', '2026-02']);
  });

  it('uses the previous month in provisional mode', () => {
    const w = monthlyWindow({ periodStart: parseYearMonth('2026-10'), previousPeriodStart: parseYearMonth('2026-04'), mode: 'provisional' });
    expect([formatYearMonth(w.startMonth), formatYearMonth(w.endMonth)]).toEqual(['2026-03', '2026-09']);
  });
});

describe('IPC (level ratio)', () => {
  it('updates a semiannual contract with published values', () => {
    // Period starting Oct-2026, previous Apr-2026 → IPC Feb-2026 → Aug-2026.
    const result = computeIndexUpdate({
      previousAmount: '500000',
      currency: 'ARS',
      rule: ipc,
      periodStart: parseYearMonth('2026-10'),
      previousPeriodStart: parseYearMonth('2026-04'),
      contractStartDay: 1,
      mode: 'real',
      lookup: ipcLookup,
    });
    expect(result).toMatchObject({
      status: 'calculated',
      start: { date: '2026-02-01', value: '10712.0000' },
      end: { date: '2026-08-01', value: '12276.7660' },
      estimated: false,
    });
    // 500000 × 12276.766 / 10712 = 573037.99 (factor 1.14607598954...)
    expect(result.status === 'calculated' && result.newAmount).toBe('573037.99');
    expect(result.status === 'calculated' && result.variationPct).toBe('14.6076');
  });

  it('waits when the index is not published yet', () => {
    const result = computeIndexUpdate({
      previousAmount: '500000',
      currency: 'ARS',
      rule: ipc,
      periodStart: parseYearMonth('2026-11'),
      previousPeriodStart: parseYearMonth('2026-05'),
      contractStartDay: 1,
      mode: 'real',
      lookup: ipcLookup,
    });
    expect(result).toEqual({ status: 'pending_index', missing: ['2026-09-01'] });
  });

  it('estimates the missing month in provisional mode', () => {
    const result = computeIndexUpdate({
      previousAmount: '500000',
      currency: 'ARS',
      rule: ipc,
      periodStart: parseYearMonth('2026-10'),
      previousPeriodStart: parseYearMonth('2026-04'),
      contractStartDay: 1,
      mode: 'provisional',
      lookup: ipcLookup,
    });
    // Sep-2026 estimated as Aug × (Aug / Jul).
    expect(result).toMatchObject({ status: 'provisional', estimated: true, start: { date: '2026-03-01' }, end: { date: '2026-09-01' } });
  });
});

describe('ICL (daily level ratio)', () => {
  const ICL: Record<string, string> = { '2026-04-15': '33.10', '2026-10-15': '36.86', '2026-02-28': '32.00', '2026-08-31': '35.50' };
  const lookup: IndexLookup = (date) => (ICL[date] ? { date, value: ICL[date]! } : null);
  const icl = { method: 'level_ratio', frequency: 'daily' } as const;

  it('uses the values of the period start days', () => {
    const result = computeIndexUpdate({
      previousAmount: '300000',
      currency: 'ARS',
      rule: icl,
      periodStart: parseYearMonth('2026-10'),
      previousPeriodStart: parseYearMonth('2026-04'),
      contractStartDay: 15,
      mode: 'real',
      lookup,
    });
    expect(result).toMatchObject({ status: 'calculated', newAmount: '334078.55' });
  });

  it('clamps the day to the end of shorter months', () => {
    const result = computeIndexUpdate({
      previousAmount: '100',
      currency: 'ARS',
      rule: icl,
      periodStart: parseYearMonth('2026-08'),
      previousPeriodStart: parseYearMonth('2026-02'),
      contractStartDay: 31,
      mode: 'real',
      lookup,
    });
    expect(result).toMatchObject({ status: 'calculated', start: { date: '2026-02-28' }, end: { date: '2026-08-31' } });
  });
});

describe('Casa Propia (coefficient product)', () => {
  it('multiplies the monthly coefficients of the window', () => {
    const coef: Record<string, string> = { '2025-11-01': '1.02', '2025-12-01': '1.03', '2026-01-01': '1.01' };
    const result = computeIndexUpdate({
      previousAmount: '100000',
      currency: 'ARS',
      rule: { method: 'coefficient_product', frequency: 'monthly' },
      periodStart: parseYearMonth('2026-04'),
      previousPeriodStart: parseYearMonth('2026-01'),
      contractStartDay: 1,
      mode: 'real',
      lookup: (date) => (coef[date] ? { date, value: coef[date]! } : null),
    });
    // 1.02 × 1.03 × 1.01 = 1.061106
    expect(result).toMatchObject({ status: 'calculated', newAmount: '106110.60', variationPct: '6.1106' });
  });
});

describe('fixed percentage', () => {
  it('applies the percentage exactly', () => {
    expect(computeFixedUpdate('500000', 'ARS', '10')).toEqual({ status: 'calculated', newAmount: '550000.00', variationPct: '10.0000' });
  });
});
