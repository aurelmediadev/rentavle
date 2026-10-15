import { describe, expect, it } from 'vitest';
import { cuitCheckDigit, formatCuit, normalizeCuit } from './cuit';

describe('CUIT', () => {
  it('computes the check digit', () => {
    expect(cuitCheckDigit('2012345678')).toBe(6);
    expect(cuitCheckDigit('3369345023')).toBe(9);
  });

  it('accepts valid CUITs in any common format', () => {
    expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
    expect(normalizeCuit('33 69345023 9')).toBe('33693450239');
    expect(normalizeCuit('20.12345678.6')).toBe('20123456786');
  });

  it('rejects wrong check digits, lengths and prefixes', () => {
    expect(normalizeCuit('20-12345678-5')).toBeNull();
    expect(normalizeCuit('2012345678')).toBeNull();
    expect(normalizeCuit('99-12345678-1')).toBeNull();
    expect(normalizeCuit('abc')).toBeNull();
  });

  it('formats with dashes', () => {
    expect(formatCuit('20123456786')).toBe('20-12345678-6');
  });
});

describe('Argentine amounts in words', () => {
  it('names the currency', async () => {
    const { argentina } = await import('./index');
    expect(argentina.amountInWords('481500', 'ARS')).toBe('pesos cuatrocientos ochenta y un mil quinientos con 00/100');
    expect(argentina.amountInWords('1200.5', 'USD')).toBe('dólares estadounidenses mil doscientos con 50/100');
  });
});
