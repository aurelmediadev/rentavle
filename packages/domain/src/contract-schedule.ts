import {
  type YearMonth,
  addMonths,
  compareYearMonth,
  monthsBetween,
  yearMonthOfDate,
} from './year-month';

/**
 * Installments and update periods of a rental contract
 * (docs/03-reglas-de-negocio.md §1 and §2). Pure functions: no I/O, no clock.
 */

export interface ContractTerm {
  /** ISO dates (YYYY-MM-DD). Installments are calendar months between them. */
  startDate: string;
  endDate: string;
}

export interface UpdatePeriod {
  /** 1-based. Period 1 starts at the contract start. */
  number: number;
  startMonth: YearMonth;
  endMonth: YearMonth;
}

export function startMonthOf(term: ContractTerm): YearMonth {
  return yearMonthOfDate(term.startDate);
}

export function endMonthOf(term: ContractTerm): YearMonth {
  return yearMonthOfDate(term.endDate);
}

export function assertValidTerm(term: ContractTerm): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(term.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(term.endDate)) {
    throw new RangeError('Contract dates must be YYYY-MM-DD');
  }
  if (term.endDate <= term.startDate) {
    throw new RangeError('The contract must end after it starts');
  }
}

/** Number of monthly installments ("36" for a 3-year contract). */
export function installmentCount(term: ContractTerm): number {
  assertValidTerm(term);
  return monthsBetween(startMonthOf(term), endMonthOf(term)) + 1;
}

/** Installment number of a month (1-based), or null when outside the contract. */
export function installmentNumber(term: ContractTerm, month: YearMonth): number | null {
  const n = monthsBetween(startMonthOf(term), month) + 1;
  return n >= 1 && n <= installmentCount(term) ? n : null;
}

/** Duration in whole months, for labels like "3 años" or "18 meses". */
export function durationLabel(term: ContractTerm): string {
  const months = installmentCount(term);
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? '1 año' : `${years} años`;
  }
  return months === 1 ? '1 mes' : `${months} meses`;
}

/**
 * Splits the contract in blocks of `frequencyMonths`. Without updates
 * (frequency null) the whole contract is a single period.
 */
export function updatePeriods(term: ContractTerm, frequencyMonths: number | null): UpdatePeriod[] {
  const total = installmentCount(term);
  const size = frequencyMonths ?? total;
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`Invalid update frequency: ${frequencyMonths}`);
  }
  const start = startMonthOf(term);
  const end = endMonthOf(term);
  const periods: UpdatePeriod[] = [];
  for (let offset = 0, number = 1; offset < total; offset += size, number++) {
    const startMonth = addMonths(start, offset);
    const candidateEnd = addMonths(startMonth, size - 1);
    periods.push({
      number,
      startMonth,
      endMonth: compareYearMonth(candidateEnd, end) > 0 ? end : candidateEnd,
    });
  }
  return periods;
}

export function periodContaining(periods: readonly UpdatePeriod[], month: YearMonth): UpdatePeriod | null {
  return (
    periods.find(
      (p) => compareYearMonth(p.startMonth, month) <= 0 && compareYearMonth(month, p.endMonth) <= 0,
    ) ?? null
  );
}

/**
 * First month that generates debts. For a contract already running when it is
 * loaded, earlier installments are considered paid (Krenta does the same) and
 * the default is the current month.
 */
export function defaultFirstBilledMonth(term: ContractTerm, currentMonth: YearMonth): YearMonth {
  const start = startMonthOf(term);
  const end = endMonthOf(term);
  if (compareYearMonth(currentMonth, start) <= 0) return start;
  if (compareYearMonth(currentMonth, end) > 0) return end;
  return currentMonth;
}

export type PeriodStatus = 'not_billed' | 'initial' | 'pending';

export interface PlannedPeriod extends UpdatePeriod {
  status: PeriodStatus;
}

/**
 * Status of each period when a contract is created:
 * - periods that end before the first billed month were never billed here;
 * - the period containing the first billed month uses the amount the user typed;
 * - later periods wait for their update.
 */
export function planPeriods(
  term: ContractTerm,
  frequencyMonths: number | null,
  firstBilledMonth: YearMonth,
): PlannedPeriod[] {
  const periods = updatePeriods(term, frequencyMonths);
  const current = periodContaining(periods, firstBilledMonth);
  if (!current) throw new RangeError('The first billed month must be within the contract');
  return periods.map((p) => ({
    ...p,
    status: p.number < current.number ? 'not_billed' : p.number === current.number ? 'initial' : 'pending',
  }));
}
