import { describe, expect, it } from 'vitest';
import { amountInWords, integerInWords } from './words';

describe('amounts in Spanish words', () => {
  it.each([
    [0n, 'cero'],
    [1n, 'uno'],
    [15n, 'quince'],
    [21n, 'veintiuno'],
    [30n, 'treinta'],
    [31n, 'treinta y uno'],
    [100n, 'cien'],
    [101n, 'ciento uno'],
    [500n, 'quinientos'],
    [999n, 'novecientos noventa y nueve'],
    [1000n, 'mil'],
    [1001n, 'mil uno'],
    [21000n, 'veintiún mil'],
    [31000n, 'treinta y un mil'],
    [100000n, 'cien mil'],
    [101000n, 'ciento un mil'],
    [481500n, 'cuatrocientos ochenta y un mil quinientos'],
    [1000000n, 'un millón'],
    [1250000n, 'un millón doscientos cincuenta mil'],
    [2000000n, 'dos millones'],
    [21000000n, 'veintiún millones'],
    [1000000000n, 'mil millones'],
    [1001000001n, 'mil un millones uno'],
    [1001001001n, 'mil un millones mil uno'],
  ])('%s → %s', (value, words) => {
    expect(integerInWords(value)).toBe(words);
  });

  it('adds the cents as a fraction', () => {
    expect(amountInWords('500000')).toBe('quinientos mil con 00/100');
    expect(amountInWords('615000.5')).toBe('seiscientos quince mil con 50/100');
    expect(amountInWords('0.07')).toBe('cero con 07/100');
    expect(() => amountInWords('1,5')).toThrow(RangeError);
  });
});
