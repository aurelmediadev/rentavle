/**
 * Parses amounts typed by users in Spanish-speaking locales: "500.000",
 * "500.000,50", "500000.5" or "1500". Returns a plain decimal string ("500000.50")
 * for Decimal/numeric columns, or null when it isn't a number. Never uses floats.
 */
export function parseLocaleDecimal(input: string): string | null {
  const value = input.trim().replace(/\s|\$/g, "");
  if (value === "") return null;
  let normalized: string;
  if (value.includes(",")) {
    // Comma is the decimal separator; dots are thousands separators.
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    normalized = value.replace(/\./g, "");
  } else {
    normalized = value;
  }
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/** Formats an exact decimal string as money, e.g. "$ 500.000". */
export function formatMoney(amount: string | null | undefined, currency: string, locale = "es-AR"): string {
  if (amount === null || amount === undefined) return "—";
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  // Intl formats decimal strings exactly (no float conversion).
  return format.format(amount as unknown as number);
}

export function formatPercent(value: string | null | undefined, locale = "es-AR"): string {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value as unknown as number)}%`;
}

/** "10.5000" → "10.5", "500000.00" → "500000" (exact; for form defaults). */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
