import Decimal from 'decimal.js';
import { currencyScale, decimal } from './money';
import { type YearMonth, addMonths, formatYearMonth } from './year-month';

/**
 * Rent updates by index (docs/03-reglas-de-negocio.md §2). Pure: index values
 * are provided through a lookup, so the same code runs in jobs, previews and tests.
 *
 *   new amount = previous amount × factor
 *
 * - level_ratio: factor = value(end) / value(start). IPC (monthly levels) and ICL
 *   (daily values).
 * - coefficient_product: factor = Π monthly coefficients of the period
 *   (Casa Propia).
 */

export type IndexMethod = 'level_ratio' | 'coefficient_product';
export type IndexFrequency = 'monthly' | 'daily';

export interface IndexRule {
  method: IndexMethod;
  frequency: IndexFrequency;
}

export interface IndexReading {
  /** YYYY-MM-DD (first day of the month for monthly series). */
  date: string;
  value: string;
}

/** Returns the published value for an exact date, or null. */
export type IndexLookup = (date: string) => IndexReading | null;

/**
 * Monthly series are published late (INDEC publishes a month's IPC mid next month).
 * - "real": only published values; the last month used is two months before the update.
 * - "provisional": uses the previous month; if it isn't published yet it is estimated
 *   repeating the last known monthly variation, and the result is marked provisional.
 */
export type MonthlyIndexMode = 'real' | 'provisional';

export interface IndexUpdateInput {
  previousAmount: string;
  currency: string;
  rule: IndexRule;
  /** First month of the period being updated and of the previous one. */
  periodStart: YearMonth;
  previousPeriodStart: YearMonth;
  /** Day of the month the contract starts (daily series use it). */
  contractStartDay: number;
  mode: MonthlyIndexMode;
  lookup: IndexLookup;
}

export interface CalculatedUpdate {
  status: 'calculated' | 'provisional';
  newAmount: string;
  /** Percentage, e.g. "8.0400" for +8.04%. */
  variationPct: string;
  start: IndexReading;
  end: IndexReading;
  /** End value was estimated (provisional mode). */
  estimated: boolean;
}

export interface MissingIndex {
  status: 'pending_index';
  missing: string[];
}

export type IndexUpdateResult = CalculatedUpdate | MissingIndex;

const monthDate = (ym: YearMonth) => `${formatYearMonth(ym)}-01`;

function dayInMonth(ym: YearMonth, day: number): string {
  const last = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  return `${formatYearMonth(ym)}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function finish(
  input: IndexUpdateInput,
  factor: Decimal,
  start: IndexReading,
  end: IndexReading,
  estimated: boolean,
): CalculatedUpdate {
  const newAmount = decimal(input.previousAmount)
    .times(factor)
    .toDecimalPlaces(currencyScale(input.currency), Decimal.ROUND_HALF_UP);
  return {
    status: estimated ? 'provisional' : 'calculated',
    newAmount: newAmount.toFixed(currencyScale(input.currency)),
    variationPct: factor.minus(1).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    start,
    end,
    estimated,
  };
}

/** Months used by monthly series for a period, after the publication lag. */
export function monthlyWindow(input: Pick<IndexUpdateInput, 'periodStart' | 'previousPeriodStart' | 'mode'>) {
  const lag = input.mode === 'real' ? 2 : 1;
  return { startMonth: addMonths(input.previousPeriodStart, -lag), endMonth: addMonths(input.periodStart, -lag) };
}

export function computeIndexUpdate(input: IndexUpdateInput): IndexUpdateResult {
  const { rule, lookup } = input;

  if (rule.frequency === 'daily') {
    const startDate = dayInMonth(input.previousPeriodStart, input.contractStartDay);
    const endDate = dayInMonth(input.periodStart, input.contractStartDay);
    const start = lookup(startDate);
    const end = lookup(endDate);
    if (!start || !end) {
      return { status: 'pending_index', missing: [!start && startDate, !end && endDate].filter(Boolean) as string[] };
    }
    return finish(input, decimal(end.value).dividedBy(start.value), start, end, false);
  }

  const { startMonth, endMonth } = monthlyWindow(input);

  if (rule.method === 'level_ratio') {
    const start = lookup(monthDate(startMonth));
    if (!start) return { status: 'pending_index', missing: [monthDate(startMonth)] };
    const end = lookup(monthDate(endMonth));
    if (end) return finish(input, decimal(end.value).dividedBy(start.value), start, end, false);

    if (input.mode === 'provisional') {
      // Estimate the missing last month repeating the previous monthly variation.
      const last = lookup(monthDate(addMonths(endMonth, -1)));
      const beforeLast = lookup(monthDate(addMonths(endMonth, -2)));
      if (last && beforeLast) {
        const estimatedValue = decimal(last.value).times(decimal(last.value).dividedBy(beforeLast.value));
        const estimatedEnd = { date: monthDate(endMonth), value: estimatedValue.toDecimalPlaces(6).toString() };
        return finish(input, estimatedValue.dividedBy(start.value), start, estimatedEnd, true);
      }
    }
    return { status: 'pending_index', missing: [monthDate(endMonth)] };
  }

  // coefficient_product: one coefficient per month in [startMonth, endMonth).
  let factor = decimal(1);
  const missing: string[] = [];
  let first: IndexReading | null = null;
  let lastReading: IndexReading | null = null;
  for (let m = startMonth; formatYearMonth(m) < formatYearMonth(endMonth); m = addMonths(m, 1)) {
    const reading = lookup(monthDate(m));
    if (!reading) {
      missing.push(monthDate(m));
      continue;
    }
    first ??= reading;
    lastReading = reading;
    factor = factor.times(reading.value);
  }
  if (missing.length || !first || !lastReading) return { status: 'pending_index', missing };
  return finish(input, factor, first, lastReading, false);
}

/** Fixed percentage per period ("10% semestral"). */
export function computeFixedUpdate(previousAmount: string, currency: string, pct: string) {
  const factor = decimal(1).plus(decimal(pct).dividedBy(100));
  const newAmount = decimal(previousAmount)
    .times(factor)
    .toDecimalPlaces(currencyScale(currency), Decimal.ROUND_HALF_UP);
  return {
    status: 'calculated' as const,
    newAmount: newAmount.toFixed(currencyScale(currency)),
    variationPct: decimal(pct).toDecimalPlaces(4).toFixed(4),
  };
}
