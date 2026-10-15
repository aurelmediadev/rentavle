import { type YearMonth, addMonths, compareYearMonth, monthRange, monthsBetween, parseYearMonth } from './year-month';

/**
 * Which debts a contract generates each month (docs/03-reglas-de-negocio.md §3).
 * Months are billing months: the month in which the debt is owed.
 */

/** Due date of a month's debts: the contract's due day (1-28) of that month. */
export function dueDate(month: YearMonth, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new RangeError(`Invalid due day: ${dueDay}`);
  return `${month.year}-${String(month.month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
}

/**
 * Months that must have a rent debt by `upTo` (inclusive): from the first billed
 * month to the end of the contract, never later than `upTo`.
 */
export function rentMonthsDue(opts: { firstBilledMonth: YearMonth; endMonth: YearMonth; upTo: YearMonth }): YearMonth[] {
  const last = compareYearMonth(opts.upTo, opts.endMonth) < 0 ? opts.upTo : opts.endMonth;
  return monthRange(opts.firstBilledMonth, last);
}

export interface RentPeriodAmount {
  startMonth: YearMonth;
  endMonth: YearMonth;
  /** Null while the update waits for its index. */
  amount: string | null;
}

export interface RentForMonth {
  amount: string;
  /** False when the period's update isn't known yet and the previous amount is used. */
  confirmed: boolean;
}

/**
 * Rent owed in a month. If the period's update isn't calculated yet, the last
 * known amount is used and the debt is left unconfirmed until it is.
 */
export function rentForMonth(periods: readonly RentPeriodAmount[], month: YearMonth): RentForMonth | null {
  const sorted = [...periods].sort((a, b) => compareYearMonth(a.startMonth, b.startMonth));
  const index = sorted.findIndex(
    (p) => compareYearMonth(p.startMonth, month) <= 0 && compareYearMonth(month, p.endMonth) <= 0,
  );
  if (index === -1) return null;
  const period = sorted[index]!;
  if (period.amount !== null) return { amount: period.amount, confirmed: true };
  for (let i = index - 1; i >= 0; i--) {
    const previous = sorted[i]!.amount;
    if (previous !== null) return { amount: previous, confirmed: false };
  }
  return null;
}

export type ChargeTiming = 'in_advance' | 'in_arrears';

export interface RecurringRule {
  /** First service month. */
  startMonth: YearMonth;
  /** Last service month (inclusive); null = until the contract ends. */
  endMonth: YearMonth | null;
  frequencyMonths: number;
  /**
   * in_advance: the service month is billed in the same month (e.g. expensas).
   * in_arrears: billed the following month, when the bill arrives (e.g. utilities).
   */
  timing: ChargeTiming;
}

/** Service month covered by a debt billed in `billingMonth`, or null if none is due then. */
export function recurringServiceMonth(rule: RecurringRule, billingMonth: YearMonth): YearMonth | null {
  if (!Number.isInteger(rule.frequencyMonths) || rule.frequencyMonths < 1) {
    throw new RangeError(`Invalid frequency: ${rule.frequencyMonths}`);
  }
  const service = rule.timing === 'in_arrears' ? addMonths(billingMonth, -1) : billingMonth;
  if (compareYearMonth(service, rule.startMonth) < 0) return null;
  if (rule.endMonth && compareYearMonth(service, rule.endMonth) > 0) return null;
  return monthsBetween(rule.startMonth, service) % rule.frequencyMonths === 0 ? service : null;
}

/** Billing months in [from, to] in which a recurring charge is due, with their service month. */
export function recurringMonthsDue(
  rule: RecurringRule,
  from: YearMonth,
  to: YearMonth,
): { billingMonth: YearMonth; serviceMonth: YearMonth }[] {
  return monthRange(from, to).flatMap((billingMonth) => {
    const serviceMonth = recurringServiceMonth(rule, billingMonth);
    return serviceMonth ? [{ billingMonth, serviceMonth }] : [];
  });
}

/** Convenience for "YYYY-MM-DD" values stored as first day of month. */
export function monthOfDate(isoDate: string): YearMonth {
  return parseYearMonth(isoDate.slice(0, 7));
}
