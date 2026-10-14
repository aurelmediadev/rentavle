import { and, asc, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';
import { type Database, schema } from '@rentavle/db';
import {
  type IndexLookup,
  type IndexReading,
  type MonthlyIndexMode,
  computeFixedUpdate,
  computeIndexUpdate,
  parseYearMonth,
} from '@rentavle/domain';

const { contracts, rentPeriods, indexSeries, indexValues, organizations } = schema;

const RECALCULABLE = ['pending', 'pending_index', 'provisional'] as const;

function monthInTimezone(now: Date, timezone: string, offsetMonths = 0): string {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  const d = new Date(Date.UTC(year!, month! - 1 + offsetMonths, 1));
  return d.toISOString().slice(0, 10);
}

export interface ApplyRentUpdatesOptions {
  now: Date;
  /** Limit the run to one organization (user-triggered recalculation). */
  organizationId?: string;
}

export interface ApplyRentUpdatesResult {
  examined: number;
  calculated: number;
  provisional: number;
  waitingForIndex: number;
}

/**
 * Calculates the amount of update periods that start this month or next month
 * (so tenants can be notified in advance) as soon as the index values exist.
 * Provisional amounts are recalculated when the real values are published.
 * Idempotent: periods already calculated, adjusted by hand or not billed are
 * never touched.
 */
export async function applyRentUpdates(db: Database, opts: ApplyRentUpdatesOptions): Promise<ApplyRentUpdatesResult> {
  const result: ApplyRentUpdatesResult = { examined: 0, calculated: 0, provisional: 0, waitingForIndex: 0 };

  const candidates = await db
    .select({ period: rentPeriods, contract: contracts, timezone: organizations.timezone, settings: organizations.settings })
    .from(rentPeriods)
    .innerJoin(contracts, eq(contracts.id, rentPeriods.contractId))
    .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
    .where(
      and(
        inArray(rentPeriods.status, [...RECALCULABLE]),
        eq(contracts.status, 'active'),
        isNull(contracts.deletedAt),
        ne(contracts.updateMode, 'none'),
        opts.organizationId ? eq(contracts.organizationId, opts.organizationId) : undefined,
      ),
    )
    .orderBy(asc(rentPeriods.contractId), asc(rentPeriods.periodNumber));

  // Only periods starting up to next month (in each organization's time zone).
  const due = candidates.filter((c) => c.period.startMonth <= monthInTimezone(opts.now, c.timezone, 1));
  if (due.length === 0) return result;

  // Load every index value the due periods may need, once.
  const seriesIds = [...new Set(due.map((d) => d.contract.indexSeriesId).filter((id): id is string => Boolean(id)))];
  const series = seriesIds.length ? await db.select().from(indexSeries).where(inArray(indexSeries.id, seriesIds)) : [];
  const earliest = due.reduce((min, d) => (d.contract.startDate < min ? d.contract.startDate : min), due[0]!.contract.startDate);
  const values = seriesIds.length
    ? await db
        .select()
        .from(indexValues)
        .where(and(inArray(indexValues.seriesId, seriesIds), gte(indexValues.date, `${Number(earliest.slice(0, 4)) - 1}-01-01`), lte(indexValues.date, '9999-12-31')))
    : [];
  const valuesBySeries = new Map<string, Map<string, IndexReading>>();
  for (const v of values) {
    const map = valuesBySeries.get(v.seriesId) ?? new Map<string, IndexReading>();
    map.set(v.date, { date: v.date, value: v.value });
    valuesBySeries.set(v.seriesId, map);
  }

  for (const { period, contract, settings } of due) {
    result.examined++;
    const [previous] = await db
      .select()
      .from(rentPeriods)
      .where(and(eq(rentPeriods.contractId, contract.id), eq(rentPeriods.periodNumber, period.periodNumber - 1)));
    // The chain needs the previous amount; periods are processed in order.
    if (!previous?.amount) {
      result.waitingForIndex++;
      continue;
    }

    let update:
      | { status: 'calculated' | 'provisional'; newAmount: string; variationPct: string; start?: IndexReading; end?: IndexReading }
      | { status: 'pending_index' };

    if (contract.updateMode === 'fixed_pct') {
      update = computeFixedUpdate(previous.amount, contract.currency, contract.fixedUpdatePct!);
    } else {
      const s = series.find((x) => x.id === contract.indexSeriesId);
      if (!s) {
        result.waitingForIndex++;
        continue;
      }
      const readings = valuesBySeries.get(s.id) ?? new Map<string, IndexReading>();
      const lookup: IndexLookup = (date) => readings.get(date) ?? null;
      const mode: MonthlyIndexMode = (settings as { ipcMode?: MonthlyIndexMode }).ipcMode ?? 'real';
      update = computeIndexUpdate({
        previousAmount: previous.amount,
        currency: contract.currency,
        rule: { method: s.method, frequency: s.frequency },
        periodStart: parseYearMonth(period.startMonth.slice(0, 7)),
        previousPeriodStart: parseYearMonth(previous.startMonth.slice(0, 7)),
        contractStartDay: Number(contract.startDate.slice(8, 10)),
        mode,
        lookup,
      });
    }

    if (update.status === 'pending_index') {
      result.waitingForIndex++;
      if (period.status === 'pending') {
        await db.update(rentPeriods).set({ status: 'pending_index' }).where(eq(rentPeriods.id, period.id));
      }
      continue;
    }

    await db
      .update(rentPeriods)
      .set({
        status: update.status,
        previousAmount: previous.amount,
        amount: update.newAmount,
        variationPct: update.variationPct,
        indexStartDate: update.start?.date ?? null,
        indexStartValue: update.start?.value ?? null,
        indexEndDate: update.end?.date ?? null,
        indexEndValue: update.end?.value ?? null,
        calculatedAt: opts.now,
      })
      .where(eq(rentPeriods.id, period.id));
    if (update.status === 'calculated') result.calculated++;
    else result.provisional++;
  }
  return result;
}
