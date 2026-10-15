import { describe, expect, it } from 'vitest';
import { allocatePayment, lateInterest } from './payments';

describe('late interest', () => {
  const base = { outstanding: '500000', currency: 'ARS', dueDate: '2026-10-10', dailyPct: '0.5' };

  it('reproduces Krenta: paid on the 14th counting from day 1 → 14 days, $35.000', () => {
    expect(lateInterest({ ...base, paymentDate: '2026-10-14', from: 'day_1' })).toEqual({
      days: 14,
      amount: '35000.00',
      explanation: '14 días de mora × 0,5% × $ 500.000',
    });
  });

  it('counts from the day after the due date by default', () => {
    expect(lateInterest({ ...base, paymentDate: '2026-10-14', from: 'after_due' })).toMatchObject({ days: 4, amount: '10000.00' });
    expect(lateInterest({ ...base, paymentDate: '2026-10-11', from: 'after_due' })?.explanation).toBe(
      '1 día de mora × 0,5% × $ 500.000',
    );
  });

  it('is zero when paid on time or without a rate', () => {
    expect(lateInterest({ ...base, paymentDate: '2026-10-10', from: 'day_1' })).toBeNull();
    expect(lateInterest({ ...base, paymentDate: '2026-10-20', from: 'after_due', dailyPct: '0' })).toBeNull();
  });

  it('restarts from the last partial payment, on the remaining balance', () => {
    const r = lateInterest({ ...base, outstanding: '200000', paymentDate: '2026-10-25', from: 'after_due', lastPaymentDate: '2026-10-20' });
    expect(r).toMatchObject({ days: 5, amount: '5000.00' });
  });

  it('spans month boundaries and rounds half up', () => {
    const r = lateInterest({ ...base, outstanding: '333333.33', paymentDate: '2026-11-02', from: 'after_due', dailyPct: '0.3' });
    // 23 days × 0.3% × 333333.33 = 22999.99977 → 23000.00
    expect(r).toMatchObject({ days: 23, amount: '23000.00' });
  });
});

describe('payment allocation', () => {
  const charges = [
    { id: 'expensas-oct', kind: 'other' as const, periodMonth: '2026-10-01', outstanding: '80000' },
    { id: 'rent-oct', kind: 'rent' as const, periodMonth: '2026-10-01', outstanding: '500000' },
    { id: 'interest-oct', kind: 'late_interest' as const, periodMonth: '2026-10-01', outstanding: '35000' },
  ];

  it('pays everything when the amount matches (Krenta example: $615.000)', () => {
    expect(allocatePayment('615000', charges, 'ARS')).toEqual({
      allocations: [
        { chargeId: 'interest-oct', amount: '35000.00' },
        { chargeId: 'rent-oct', amount: '500000.00' },
        { chargeId: 'expensas-oct', amount: '80000.00' },
      ],
      surplus: '0.00',
      unpaid: '0.00',
    });
  });

  it('pays interest, then rent, then expenses on a partial payment', () => {
    const r = allocatePayment('300000', charges, 'ARS');
    expect(r.allocations).toEqual([
      { chargeId: 'interest-oct', amount: '35000.00' },
      { chargeId: 'rent-oct', amount: '265000.00' },
    ]);
    expect(r.unpaid).toBe('315000.00');
  });

  it('pays the oldest month first', () => {
    const r = allocatePayment('500000', [
      { id: 'rent-nov', kind: 'rent', periodMonth: '2026-11-01', outstanding: '500000' },
      { id: 'rent-oct', kind: 'rent', periodMonth: '2026-10-01', outstanding: '500000' },
    ], 'ARS');
    expect(r.allocations).toEqual([{ chargeId: 'rent-oct', amount: '500000.00' }]);
  });

  it('applies credits first and keeps any surplus as saldo a favor', () => {
    const r = allocatePayment('600000', [
      { id: 'rent-oct', kind: 'rent', periodMonth: '2026-10-01', outstanding: '500000' },
      { id: 'discount', kind: 'other', periodMonth: '2026-10-01', outstanding: '-10000' },
    ], 'ARS');
    expect(r).toEqual({
      allocations: [
        { chargeId: 'discount', amount: '-10000.00' },
        { chargeId: 'rent-oct', amount: '500000.00' },
      ],
      surplus: '110000.00',
      unpaid: '0.00',
    });
  });

  it('rejects negative amounts', () => {
    expect(() => allocatePayment('-1', charges, 'ARS')).toThrow(RangeError);
  });
});
