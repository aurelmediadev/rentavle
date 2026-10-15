/**
 * Amounts in Spanish words, as receipts print them: "quinientos mil con 00/100".
 * Shared by every Spanish-speaking country; each pack names its currencies.
 */

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TEENS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TWENTIES = [
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
  'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

/** 1..999. With `apocope`, "uno" becomes "un" (before "mil", "millones"). */
function belowThousand(n: number, apocope: boolean): string {
  if (n === 100) return 'cien';
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest >= 30) {
    const unit = rest % 10;
    parts.push(unit ? `${TENS[Math.floor(rest / 10)]} y ${UNITS[unit]}` : TENS[rest / 10]!);
  } else if (rest >= 20) {
    parts.push(TWENTIES[rest - 20]!);
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]!);
  } else if (rest > 0) {
    parts.push(UNITS[rest]!);
  }
  const text = parts.join(' ');
  if (!apocope) return text;
  return text.replace(/veintiuno$/, 'veintiún').replace(/\buno$/, 'un');
}

/** 0..999.999 */
function belowMillion(n: number, apocope: boolean): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (thousands === 1) parts.push('mil');
  else if (thousands > 1) parts.push(`${belowThousand(thousands, true)} mil`);
  if (rest) parts.push(belowThousand(rest, apocope));
  return parts.join(' ');
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const MILLION = BigInt(1_000_000);

/** Integer part in words: 1.250.000 → "un millón doscientos cincuenta mil". */
export function integerInWords(value: bigint): string {
  if (value < ZERO) return `menos ${integerInWords(-value)}`;
  if (value === ZERO) return 'cero';
  const millions = value / MILLION;
  const rest = Number(value % MILLION);
  const parts: string[] = [];
  if (millions === ONE) parts.push('un millón');
  else if (millions > ONE) {
    if (millions >= MILLION) throw new RangeError('Amount too large');
    parts.push(`${belowMillion(Number(millions), true)} millones`);
  }
  if (rest) parts.push(belowMillion(rest, false));
  return parts.join(' ');
}

/**
 * "500000.5" → "quinientos mil con 50/100". Expects a decimal string with at
 * most two decimals (amounts come from numeric(14,2) columns).
 */
export function amountInWords(amount: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new RangeError(`Invalid amount: ${amount}`);
  const [, sign, integer, decimals = ''] = match;
  const cents = decimals.padEnd(2, '0');
  return `${sign ? 'menos ' : ''}${integerInWords(BigInt(integer!))} con ${cents}/100`;
}
