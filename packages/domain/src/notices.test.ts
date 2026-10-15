import { describe, expect, it } from 'vitest';
import { amountUpdateNotice, contractExpiryNotice, debtNotice, defaultNoticeSettings, parseNoticeSettings } from './notices';

const on = { ...defaultNoticeSettings, paymentReminder: true, lateNotice: true, amountUpdate: true, contractExpiry: true };
const debt = { id: 'c1', dueDate: '2026-10-10' };

describe('notice settings', () => {
  it('starts with every notice off and tolerates bad values', () => {
    expect(parseNoticeSettings(undefined)).toEqual(defaultNoticeSettings);
    expect(parseNoticeSettings({ lateNotice: true, lateDays: [10, 'x', 1, 1, -2], reminderDaysBefore: 999 })).toMatchObject({
      lateNotice: true,
      lateDays: [1, 10],
      reminderDaysBefore: 3,
      paymentReminder: false,
    });
  });
});

describe('debt notices', () => {
  it('reminds from N days before the due date', () => {
    expect(debtNotice('2026-10-06', debt, on)).toBeNull();
    expect(debtNotice('2026-10-07', debt, on)).toEqual({ type: 'payment_reminder', key: 'payment_reminder:c1' });
    expect(debtNotice('2026-10-09', debt, on)).toEqual({ type: 'payment_reminder', key: 'payment_reminder:c1' });
  });

  it('nothing on the due date; late notices on each threshold', () => {
    expect(debtNotice('2026-10-10', debt, on)).toBeNull();
    expect(debtNotice('2026-10-11', debt, on)).toEqual({ type: 'late_notice', key: 'late_notice:c1:1', daysLate: 1 });
    expect(debtNotice('2026-10-13', debt, on)).toMatchObject({ key: 'late_notice:c1:1', daysLate: 3 });
    expect(debtNotice('2026-10-15', debt, on)).toMatchObject({ key: 'late_notice:c1:5', daysLate: 5 });
    expect(debtNotice('2026-10-20', debt, on)).toMatchObject({ key: 'late_notice:c1:10', daysLate: 10 });
  });

  it('does not notify about old debts after the last window', () => {
    expect(debtNotice('2026-10-24', debt, on)).toBeNull();
    expect(debtNotice('2027-02-01', debt, on)).toBeNull();
  });

  it('respects what is turned off', () => {
    expect(debtNotice('2026-10-08', debt, defaultNoticeSettings)).toBeNull();
    expect(debtNotice('2026-10-11', debt, defaultNoticeSettings)).toBeNull();
  });
});

describe('amount update and expiry', () => {
  const period = { id: 'p1', startMonth: '2026-11-01', confirmed: true };

  it('notifies a confirmed new amount 10 days before, or when it gets confirmed late', () => {
    expect(amountUpdateNotice('2026-10-21', period, on)).toBeNull();
    expect(amountUpdateNotice('2026-10-22', period, on)).toEqual({ type: 'amount_update', key: 'amount_update:p1' });
    expect(amountUpdateNotice('2026-11-03', period, on)).not.toBeNull();
    expect(amountUpdateNotice('2026-11-10', period, on)).toBeNull();
    expect(amountUpdateNotice('2026-10-25', { ...period, confirmed: false }, on)).toBeNull();
  });

  it('warns the agency 60 and 30 days before a contract ends', () => {
    const contract = { id: 'k1', endDate: '2027-03-31' };
    expect(contractExpiryNotice('2027-01-29', contract, on)).toBeNull();
    expect(contractExpiryNotice('2027-01-30', contract, on)).toEqual({ type: 'contract_expiry', key: 'contract_expiry:k1:60', daysLeft: 60 });
    expect(contractExpiryNotice('2027-03-01', contract, on)).toMatchObject({ key: 'contract_expiry:k1:30', daysLeft: 30 });
    expect(contractExpiryNotice('2027-03-10', contract, on)).toBeNull();
  });
});
