import { type YearMonth, yearMonth } from "@rentavle/domain";

/** Today's date (YYYY-MM-DD) in a time zone. Call only at request time. */
export function todayIn(timezone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export function currentMonthIn(timezone: string): YearMonth {
  const [year, month] = todayIn(timezone).split("-").map(Number);
  return yearMonth(year!, month!);
}

/** "YYYY-MM" ↔ first day of month as stored in date columns. */
export function monthToDate(value: string): string {
  return `${value}-01`;
}

export function dateToMonth(value: string): string {
  return value.slice(0, 7);
}

/** Adds days to an ISO date without time zone effects. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const longDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" });

export function formatDate(isoDate: string | null | undefined): string {
  return isoDate ? longDate.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)) : "—";
}

/** "oct 26" for a month stored as a date. */
export function formatMonth(isoDate: string): string {
  return monthName.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)).replace(".", "");
}
