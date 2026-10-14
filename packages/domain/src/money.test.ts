import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  add,
  compare,
  equals,
  money,
  multiply,
  percentOf,
  round,
  subtract,
  sum,
  toStorageString,
} from './money';

describe('money', () => {
  it('adds without floating point drift', () => {
    const total = add(money('0.1', 'ARS'), money('0.2', 'ARS'));
    expect(toStorageString(total)).toBe('0.30');
  });

  it('refuses to mix currencies', () => {
    expect(() => add(money(1, 'ARS'), money(1, 'USD'))).toThrow(CurrencyMismatchError);
  });

  it('rejects invalid currency codes and non-finite numbers', () => {
    expect(() => money(1, 'ars')).toThrow(RangeError);
    expect(() => money(Number.NaN, 'ARS')).toThrow(RangeError);
  });

  it('rounds half up only when asked', () => {
    const third = multiply(money(100, 'ARS'), '0.333335');
    expect(third.amount.toString()).toBe('33.3335');
    expect(toStorageString(round(third))).toBe('33.33');
    expect(toStorageString(round(money('10.005', 'ARS')))).toBe('10.01');
  });

  it('uses zero decimals for CLP', () => {
    expect(toStorageString(round(money('1234.5', 'CLP')))).toBe('1235');
  });

  it('sums a list and compares', () => {
    const total = sum([money(500000, 'ARS'), money(35000, 'ARS'), money(80000, 'ARS')], 'ARS');
    expect(equals(total, money(615000, 'ARS'))).toBe(true);
    expect(compare(total, money(1, 'ARS'))).toBe(1);
    expect(toStorageString(subtract(total, money(481500, 'ARS')))).toBe('133500.00');
  });

  // Worked example from docs/03-reglas-de-negocio.md §5 (observed in Krenta).
  it('reproduces the late-fee and commission example', () => {
    const rent = money(500000, 'ARS');
    const lateFee = round(multiply(percentOf(rent, '0.5'), 14));
    expect(toStorageString(lateFee)).toBe('35000.00');

    const commission = round(percentOf(add(rent, lateFee), 10));
    expect(toStorageString(commission)).toBe('53500.00');
  });
});
