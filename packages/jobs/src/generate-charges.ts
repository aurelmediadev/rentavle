import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { type Database, schema } from '@rentavle/db';
import {
  type YearMonth,
  addMonths,
  compareYearMonth,
  dueDate,
  formatYearMonth,
  installmentNumber,
  monthOfDate,
  recurringMonthsDue,
  rentForMonth,
  rentMonthsDue,
} from '@rentavle/domain';

const { contracts, rentPeriods, charges, recurringCharges, organizations } = schema;

const toDate = (m: YearMonth) => `${formatYearMonth(m)}-01`;

function currentMonth(now: Date, timezone: string): YearMonth {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return { year: year!, month: month! };
}

export interface GenerateChargesOptions {
  now: Date;
  organizationId?: string;
  contractId?: string;
  /** Also create next month's debts (to send reminders or charge in advance). */
  includeNextMonth?: boolean;
}

export interface GenerateChargesResult {
  contracts: number;
  rentCreated: number;
  rentConfirmed: number;
  recurringCreated: number;
}

/**
 * Creates the monthly debts of active contracts up to the current month (catching
 * up any missing month) and confirms rent debts whose update got calculated.
 * Idempotent: unique indexes guarantee one rent debt per month and one debt per
 * recurring template and month.
 */
export async function generateCharges(db: Database, opts: GenerateChargesOptions): Promise<GenerateChargesResult> {
  const result: GenerateChargesResult = { contracts: 0, rentCreated: 0, rentConfirmed: 0, recurringCreated: 0 };

  const rows = await db
    .select({ contract: contracts, timezone: organizations.timezone })
    .from(contracts)
    .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
    .where(
      and(
        eq(contracts.status, 'active'),
        isNull(contracts.deletedAt),
        opts.organizationId ? eq(contracts.organizationId, opts.organizationId) : undefined,
        opts.contractId ? eq(contracts.id, opts.contractId) : undefined,
      ),
    );
  if (rows.length === 0) return result;

  const contractIds = rows.map((r) => r.contract.id);
  const [allPeriods, allRecurring, unconfirmedRent] = await Promise.all([
    db.select().from(rentPeriods).where(inArray(rentPeriods.contractId, contractIds)).orderBy(asc(rentPeriods.periodNumber)),
    db
      .select()
      .from(recurringCharges)
      .where(and(inArray(recurringCharges.contractId, contractIds), isNull(recurringCharges.deletedAt))),
    db
      .select()
      .from(charges)
      .where(
        and(
          inArray(charges.contractId, contractIds),
          eq(charges.type, 'rent'),
          eq(charges.isConfirmed, false),
          eq(charges.status, 'pending'),
        ),
      ),
  ]);

  for (const { contract, timezone } of rows) {
    result.contracts++;
    const now = currentMonth(opts.now, timezone);
    const upTo = opts.includeNextMonth ? addMonths(now, 1) : now;
    const endMonth = monthOfDate(contract.endDate);
    const term = { startDate: contract.startDate, endDate: contract.endDate };
    const periods = allPeriods.filter((p) => p.contractId === contract.id);
    const periodAmounts = periods.map((p) => ({
      startMonth: monthOfDate(p.startMonth),
      endMonth: monthOfDate(p.endMonth),
      amount: p.amount,
    }));
    const periodFor = (m: YearMonth) =>
      periods.find(
        (p) => compareYearMonth(monthOfDate(p.startMonth), m) <= 0 && compareYearMonth(m, monthOfDate(p.endMonth)) <= 0,
      );

    // 1. Rent debts.
    const rentValues = rentMonthsDue({ firstBilledMonth: monthOfDate(contract.firstBilledMonth), endMonth, upTo }).flatMap(
      (month) => {
        const rent = rentForMonth(periodAmounts, month);
        if (!rent) return [];
        const n = installmentNumber(term, month);
        return [
          {
            organizationId: contract.organizationId,
            contractId: contract.id,
            type: 'rent' as const,
            periodMonth: toDate(month),
            installmentNumber: n,
            title: 'Alquiler',
            amount: rent.amount,
            currency: contract.currency,
            debtor: 'tenant' as const,
            creditor: 'owner' as const,
            appliesFee: true,
            isConfirmed: rent.confirmed,
            dueDate: dueDate(month, contract.dueDay),
            rentPeriodId: periodFor(month)?.id ?? null,
            calcExplanation: rent.confirmed
              ? null
              : 'Monto anterior: el aumento de este período espera la publicación del índice',
          },
        ];
      },
    );
    if (rentValues.length) {
      const inserted = await db.insert(charges).values(rentValues).onConflictDoNothing().returning({ id: charges.id });
      result.rentCreated += inserted.length;
    }

    // 2. Confirm rent debts whose period now has its updated amount (only if unpaid).
    for (const charge of unconfirmedRent.filter((c) => c.contractId === contract.id)) {
      const rent = rentForMonth(periodAmounts, monthOfDate(charge.periodMonth));
      if (!rent?.confirmed) continue;
      await db
        .update(charges)
        .set({ amount: rent.amount, isConfirmed: true, calcExplanation: null })
        .where(and(eq(charges.id, charge.id), eq(charges.status, 'pending'), eq(charges.isConfirmed, false)));
      result.rentConfirmed++;
    }

    // 3. Recurring debts.
    const firstBilled = monthOfDate(contract.firstBilledMonth);
    for (const rc of allRecurring.filter((r) => r.contractId === contract.id)) {
      if (rc.lastAmount === null) continue;
      const rule = {
        startMonth: monthOfDate(rc.startMonth),
        endMonth: rc.endMonth ? monthOfDate(rc.endMonth) : endMonth,
        frequencyMonths: rc.frequencyMonths,
        timing: rc.timing,
      };
      // Services billed in arrears may be billed the month after the contract ends.
      const lastBilling = rc.timing === 'in_arrears' ? addMonths(endMonth, 1) : endMonth;
      const to = compareYearMonth(upTo, lastBilling) < 0 ? upTo : lastBilling;
      const from = compareYearMonth(rule.startMonth, firstBilled) > 0 ? rule.startMonth : firstBilled;
      const due = compareYearMonth(from, to) <= 0 ? recurringMonthsDue(rule, from, to) : [];
      if (due.length === 0) continue;
      const inserted = await db
        .insert(charges)
        .values(
          due.map(({ billingMonth, serviceMonth }) => ({
            organizationId: contract.organizationId,
            contractId: contract.id,
            type: 'recurring' as const,
            periodMonth: toDate(billingMonth),
            serviceMonth: toDate(serviceMonth),
            title: rc.title,
            amount: rc.lastAmount!,
            currency: rc.currency,
            debtor: rc.debtor,
            creditor: rc.creditor,
            appliesFee: rc.appliesFee,
            isConfirmed: !rc.requiresConfirmation,
            dueDate: dueDate(billingMonth, contract.dueDay),
            recurringChargeId: rc.id,
            calcExplanation: rc.requiresConfirmation ? 'Monto estimado: confirmalo cuando llegue la factura' : null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: charges.id });
      result.recurringCreated += inserted.length;
    }
  }
  return result;
}
