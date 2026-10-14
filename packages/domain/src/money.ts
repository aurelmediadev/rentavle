import Decimal from 'decimal.js';

/**
 * Exact money arithmetic. Amounts are never JS numbers: they are Decimal values
 * tagged with an ISO 4217 currency. Rounding happens only when a result is final
 * (see docs/03-reglas-de-negocio.md, "Convenciones").
 */

const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type CurrencyCode = string;

export interface Money {
  readonly amount: Decimal;
  readonly currency: CurrencyCode;
}

export type DecimalInput = Decimal.Value;

/** Decimal places used when storing/rounding each currency. CLP has none. */
const CURRENCY_SCALE: Record<CurrencyCode, number> = {
  ARS: 2,
  USD: 2,
  EUR: 2,
  CLP: 0,
  MXN: 2,
  COP: 2,
  UYU: 2,
  PEN: 2,
  BRL: 2,
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function currencyScale(currency: CurrencyCode): number {
  return CURRENCY_SCALE[currency] ?? 2;
}

export function decimal(value: DecimalInput): Decimal {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError(`Invalid decimal value: ${value}`);
  }
  return new Dec(value);
}

export function money(amount: DecimalInput, currency: CurrencyCode): Money {
  if (!CURRENCY_CODE.test(currency)) {
    throw new RangeError(`Invalid currency code: ${currency}`);
  }
  return Object.freeze({ amount: decimal(amount), currency });
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(`Cannot combine ${left} with ${right} without an explicit conversion`);
    this.name = 'CurrencyMismatchError';
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount.plus(b.amount), a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount.minus(b.amount), a.currency);
}

export function sum(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce((total, value) => add(total, value), zero(currency));
}

/** Multiplies by a plain factor (a percentage, a ratio, a day count). Not rounded. */
export function multiply(a: Money, factor: DecimalInput): Money {
  return money(a.amount.times(decimal(factor)), a.currency);
}

/** Applies a percentage expressed as a number of percent (10 = 10%). Not rounded. */
export function percentOf(a: Money, percent: DecimalInput): Money {
  return money(a.amount.times(decimal(percent)).dividedBy(100), a.currency);
}

/** Rounds half-up to the currency's scale. Call once, on final results. */
export function round(a: Money): Money {
  return money(
    a.amount.toDecimalPlaces(currencyScale(a.currency), Decimal.ROUND_HALF_UP),
    a.currency,
  );
}

export function isZero(a: Money): boolean {
  return a.amount.isZero();
}

export function isNegative(a: Money): boolean {
  return a.amount.isNegative() && !a.amount.isZero();
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount.equals(b.amount);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amount.comparedTo(b.amount) as -1 | 0 | 1;
}

/** Fixed-scale string for persistence in numeric columns, e.g. "500000.00". */
export function toStorageString(a: Money): string {
  return a.amount.toFixed(currencyScale(a.currency), Decimal.ROUND_HALF_UP);
}
