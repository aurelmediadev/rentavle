/** CUIT/CUIL: 11 digits, type prefix + document + check digit (modulo 11). */

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const VALID_PREFIXES = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34']);

export function cuitCheckDigit(firstTen: string): number {
  const total = WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(firstTen[i]), 0);
  const digit = 11 - (total % 11);
  if (digit === 11) return 0;
  if (digit === 10) return 9;
  return digit;
}

export function normalizeCuit(input: string): string | null {
  const digits = input.replace(/[\s.-]/g, '');
  if (!/^\d{11}$/.test(digits)) return null;
  if (!VALID_PREFIXES.has(digits.slice(0, 2))) return null;
  if (cuitCheckDigit(digits.slice(0, 10)) !== Number(digits[10])) return null;
  return digits;
}

export function formatCuit(canonical: string): string {
  return `${canonical.slice(0, 2)}-${canonical.slice(2, 10)}-${canonical.slice(10)}`;
}
