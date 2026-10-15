/**
 * When automatic notices are due (docs/03-reglas-de-negocio.md §8). Pure.
 *
 * Each notice has a dedupe key: the job records it before sending, so the same
 * notice is never sent twice. A threshold only fires during a short window after
 * it is reached, so turning notices on (or a job that was down) doesn't flood
 * tenants with notices about old debts.
 */

export interface NoticeSettings {
  paymentReminder: boolean;
  /** Days before the due date. */
  reminderDaysBefore: number;
  lateNotice: boolean;
  /** Days after the due date, e.g. [1, 5, 10]. */
  lateDays: number[];
  amountUpdate: boolean;
  /** Days before the month the new amount starts. */
  updateDaysBefore: number;
  contractExpiry: boolean;
  /** Days before the end of the contract, e.g. [60, 30]. */
  expiryDaysBefore: number[];
}

/** Automatic notices start off: each agency turns on the ones it wants. */
export const defaultNoticeSettings: NoticeSettings = {
  paymentReminder: false,
  reminderDaysBefore: 3,
  lateNotice: false,
  lateDays: [1, 5, 10],
  amountUpdate: false,
  updateDaysBefore: 10,
  contractExpiry: false,
  expiryDaysBefore: [60, 30],
};

/** Days a threshold keeps firing after it is reached (covers a job that didn't run). */
export const NOTICE_WINDOW_DAYS = 3;

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const days = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 365 ? (v as number) : fallback);
const dayList = (v: unknown, fallback: number[]) => {
  if (!Array.isArray(v)) return fallback;
  const list = [...new Set(v.filter((d) => Number.isInteger(d) && d > 0 && d <= 365) as number[])].sort((a, b) => a - b);
  return list.length ? list : fallback;
};

/** Reads organizations.settings.notices, tolerating missing or invalid values. */
export function parseNoticeSettings(raw: unknown): NoticeSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = defaultNoticeSettings;
  return {
    paymentReminder: bool(s.paymentReminder, d.paymentReminder),
    reminderDaysBefore: days(s.reminderDaysBefore, d.reminderDaysBefore),
    lateNotice: bool(s.lateNotice, d.lateNotice),
    lateDays: dayList(s.lateDays, d.lateDays),
    amountUpdate: bool(s.amountUpdate, d.amountUpdate),
    updateDaysBefore: days(s.updateDaysBefore, d.updateDaysBefore),
    contractExpiry: bool(s.contractExpiry, d.contractExpiry),
    expiryDaysBefore: dayList(s.expiryDaysBefore, d.expiryDaysBefore),
  };
}

/** Days from `a` to `b` (YYYY-MM-DD), negative if b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whether `today` is within the window that starts on `from`. */
const inWindow = (today: string, from: string) => {
  const elapsed = daysBetween(from, today);
  return elapsed >= 0 && elapsed <= NOTICE_WINDOW_DAYS;
};

export type DebtNotice =
  | { type: 'payment_reminder'; key: string }
  | { type: 'late_notice'; key: string; daysLate: number };

/** Reminder before the due date, or late notice after it, for an unpaid debt. */
export function debtNotice(
  today: string,
  debt: { id: string; dueDate: string },
  settings: NoticeSettings,
): DebtNotice | null {
  const late = daysBetween(debt.dueDate, today);
  if (late < 0) {
    if (!settings.paymentReminder) return null;
    const from = addDaysIso(debt.dueDate, -settings.reminderDaysBefore);
    return daysBetween(from, today) >= 0 ? { type: 'payment_reminder', key: `payment_reminder:${debt.id}` } : null;
  }
  if (!settings.lateNotice) return null;
  // Only the latest threshold reached, and only while it's recent.
  const threshold = [...settings.lateDays].reverse().find((d) => late >= d);
  if (threshold === undefined || !inWindow(today, addDaysIso(debt.dueDate, threshold))) return null;
  return { type: 'late_notice', key: `late_notice:${debt.id}:${threshold}`, daysLate: late };
}

/** Notice of a new rent amount, some days before the month it starts (or as soon as it's known). */
export function amountUpdateNotice(
  today: string,
  period: { id: string; startMonth: string; confirmed: boolean },
  settings: NoticeSettings,
): { type: 'amount_update'; key: string } | null {
  if (!settings.amountUpdate || !period.confirmed) return null;
  const from = addDaysIso(period.startMonth, -settings.updateDaysBefore);
  // Sent from N days before until a few days into the month (late index publications).
  const elapsed = daysBetween(from, today);
  if (elapsed < 0 || daysBetween(period.startMonth, today) > NOTICE_WINDOW_DAYS + 2) return null;
  return { type: 'amount_update', key: `amount_update:${period.id}` };
}

/** Notice to the agency that a contract is about to end. */
export function contractExpiryNotice(
  today: string,
  contract: { id: string; endDate: string },
  settings: NoticeSettings,
): { type: 'contract_expiry'; key: string; daysLeft: number } | null {
  if (!settings.contractExpiry) return null;
  const left = daysBetween(today, contract.endDate);
  const threshold = settings.expiryDaysBefore.find((d) => inWindow(today, addDaysIso(contract.endDate, -d)));
  if (threshold === undefined || left < 0) return null;
  return { type: 'contract_expiry', key: `contract_expiry:${contract.id}:${threshold}`, daysLeft: left };
}
