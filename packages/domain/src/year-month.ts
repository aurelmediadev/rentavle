/**
 * Calendar months, the unit rent is billed in ("2026-10"). Plain value objects
 * with no time zone: the organization's time zone decides which month "today" is.
 */

export interface YearMonth {
  readonly year: number;
  readonly month: number; // 1-12
}

const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

export function yearMonth(year: number, month: number): YearMonth {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new RangeError(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
  return Object.freeze({ year, month });
}

export function parseYearMonth(value: string): YearMonth {
  const match = YEAR_MONTH.exec(value);
  if (!match) {
    throw new RangeError(`Invalid year-month (expected YYYY-MM): ${value}`);
  }
  return yearMonth(Number(match[1]), Number(match[2]));
}

export function formatYearMonth(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

/** Month containing an ISO date string ("2026-10-14" → 2026-10). */
export function yearMonthOfDate(isoDate: string): YearMonth {
  return parseYearMonth(isoDate.slice(0, 7));
}

function toIndex(value: YearMonth): number {
  return value.year * 12 + (value.month - 1);
}

function fromIndex(index: number): YearMonth {
  return yearMonth(Math.floor(index / 12), (index % 12) + 1);
}

export function addMonths(value: YearMonth, months: number): YearMonth {
  if (!Number.isInteger(months)) {
    throw new RangeError(`Months must be an integer: ${months}`);
  }
  return fromIndex(toIndex(value) + months);
}

/** Whole months from `from` to `to` (to − from). */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return toIndex(to) - toIndex(from);
}

export function compareYearMonth(a: YearMonth, b: YearMonth): -1 | 0 | 1 {
  return Math.sign(toIndex(a) - toIndex(b)) as -1 | 0 | 1;
}

/** Inclusive list of months between two months. */
export function monthRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const count = monthsBetween(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => addMonths(from, i));
}
