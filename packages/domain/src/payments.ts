import Decimal from 'decimal.js';
import { currencyScale, decimal } from './money';

/**
 * Collections from tenants (docs/03-reglas-de-negocio.md §4 and §6). Pure:
 * dates are ISO strings (YYYY-MM-DD) and amounts decimal strings.
 */

const DAY_MS = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

function formatAmount(value: Decimal, currency: string): string {
  // Explanations are for people: "$ 500.000" style, no float conversion.
  const [int, frac] = value.toFixed(currencyScale(currency)).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac && !/^0+$/.test(frac) ? `$ ${grouped},${frac}` : `$ ${grouped}`;
}

export type LateInterestFrom = 'after_due' | 'day_1';

export interface LateInterestInput {
  /** Unpaid rent on which interest accrues. */
  outstanding: string;
  currency: string;
  /** YYYY-MM-DD */
  dueDate: string;
  paymentDate: string;
  /** Percent per day, e.g. "0.5". */
  dailyPct: string;
  from: LateInterestFrom;
  /** Date of the last partial payment of this debt, if any: interest restarts there. */
  lastPaymentDate?: string | null;
}

export interface LateInterest {
  days: number;
  amount: string;
  /** "14 días × 0,5% × $ 500.000" */
  explanation: string;
}

/**
 * Late interest at the moment of paying. With "after_due" paying on the 11th of a
 * debt due the 10th counts 1 day; with "day_1" it counts 11 (Krenta's default).
 */
export function lateInterest(input: LateInterestInput): LateInterest | null {
  const rate = decimal(input.dailyPct);
  const base = decimal(input.outstanding);
  if (rate.lte(0) || base.lte(0) || input.paymentDate <= input.dueDate) return null;

  const firstOfMonth = `${input.dueDate.slice(0, 7)}-01`;
  let days =
    input.from === 'day_1' ? daysBetween(firstOfMonth, input.paymentDate) + 1 : daysBetween(input.dueDate, input.paymentDate);
  if (input.lastPaymentDate && input.lastPaymentDate > input.dueDate) {
    days = Math.min(days, daysBetween(input.lastPaymentDate, input.paymentDate));
  }
  if (days <= 0) return null;

  const amount = base
    .times(rate)
    .dividedBy(100)
    .times(days)
    .toDecimalPlaces(currencyScale(input.currency), Decimal.ROUND_HALF_UP);
  if (amount.lte(0)) return null;
  const pct = rate.toString().replace('.', ',');
  return {
    days,
    amount: amount.toFixed(currencyScale(input.currency)),
    explanation: `${days} ${days === 1 ? 'día' : 'días'} de mora × ${pct}% × ${formatAmount(base, input.currency)}`,
  };
}

export type ChargeKind = 'late_interest' | 'rent' | 'other';

export interface OpenCharge {
  id: string;
  kind: ChargeKind;
  /** YYYY-MM-DD of the billing month (older debts are paid first). */
  periodMonth: string;
  /** Amount still owed; negative for credits (discounts, saldo a favor). */
  outstanding: string;
}

export interface Allocation {
  chargeId: string;
  amount: string;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Money received beyond the selected debts: becomes saldo a favor. */
  surplus: string;
  /** Amount of the selected debts left unpaid. */
  unpaid: string;
}

const KIND_ORDER: Record<ChargeKind, number> = { late_interest: 0, rent: 1, other: 2 };

/**
 * Imputes a payment to the selected debts. Credits (negative balances) are always
 * applied first; then, oldest month first and within a month late interest → rent
 * → other charges. A partial payment leaves the last debts partially paid.
 */
export function allocatePayment(received: string, charges: readonly OpenCharge[], currency: string): AllocationResult {
  const scale = currencyScale(currency);
  let available = decimal(received);
  if (available.isNegative()) throw new RangeError('The received amount cannot be negative');

  const credits = charges.filter((c) => decimal(c.outstanding).isNegative());
  const debts = charges
    .filter((c) => decimal(c.outstanding).isPositive() && !decimal(c.outstanding).isZero())
    .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const allocations: Allocation[] = [];
  for (const credit of credits) {
    allocations.push({ chargeId: credit.id, amount: decimal(credit.outstanding).toFixed(scale) });
    available = available.minus(credit.outstanding); // a credit adds purchasing power
  }

  let unpaid = decimal(0);
  for (const debt of debts) {
    const owed = decimal(debt.outstanding);
    const paid = Decimal.min(owed, Decimal.max(available, 0));
    if (paid.gt(0)) allocations.push({ chargeId: debt.id, amount: paid.toFixed(scale) });
    available = available.minus(paid);
    unpaid = unpaid.plus(owed.minus(paid));
  }

  return {
    allocations,
    surplus: Decimal.max(available, 0).toFixed(scale),
    unpaid: unpaid.toFixed(scale),
  };
}
