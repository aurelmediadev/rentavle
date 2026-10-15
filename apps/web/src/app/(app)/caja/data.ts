import "server-only";
import Decimal from "decimal.js";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership, requireRole } from "@/lib/auth";

const { cashAccounts, ledgerAccounts, ledgerEntries, movements, contracts } = schema;

const signed = sql<string>`coalesce(sum(case ${ledgerEntries.direction} when 'debit' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end), 0)`;

/** Boxes and bank accounts with their balance, from the ledger. */
export async function listCashAccounts(opts: { includeArchived?: boolean } = {}) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const accounts = await tx
      .select()
      .from(cashAccounts)
      .where(and(eq(cashAccounts.organizationId, organizationId), opts.includeArchived ? undefined : isNull(cashAccounts.archivedAt)))
      .orderBy(desc(cashAccounts.isDefault), asc(cashAccounts.name));
    const balances = await tx
      .select({ refId: ledgerAccounts.refId, balance: signed })
      .from(ledgerEntries)
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
      .where(and(eq(ledgerEntries.organizationId, organizationId), eq(ledgerAccounts.type, "cash")))
      .groupBy(ledgerAccounts.refId);
    return accounts.map((a) => ({ ...a, balance: new Decimal(balances.find((b) => b.refId === a.id)?.balance ?? 0).toFixed(2) }));
  });
}

/** Cash book of a box for a month: opening balance, entries with running balance. */
export async function cashBook(cashAccountId: string, month: string) {
  const { organizationId } = await getActiveMembership();
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return asUser(async (tx) => {
    const [account] = await tx
      .select()
      .from(cashAccounts)
      .where(and(eq(cashAccounts.id, cashAccountId), eq(cashAccounts.organizationId, organizationId)));
    if (!account) return null;
    const inBox = and(
      eq(ledgerEntries.organizationId, organizationId),
      eq(ledgerAccounts.type, "cash"),
      eq(ledgerAccounts.refId, account.id),
    );
    const [opening] = await tx
      .select({ balance: signed })
      .from(ledgerEntries)
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
      .where(and(inBox, lt(ledgerEntries.date, from)));
    const rows = await tx
      .select({
        id: ledgerEntries.id,
        date: ledgerEntries.date,
        direction: ledgerEntries.direction,
        amount: ledgerEntries.amount,
        concept: ledgerEntries.concept,
        isReversal: sql<boolean>`${ledgerEntries.reversalOfId} is not null`,
        movementNumber: movements.number,
        movementType: movements.type,
        contractNumber: contracts.number,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
      .leftJoin(movements, eq(movements.id, ledgerEntries.movementId))
      .leftJoin(contracts, eq(contracts.id, movements.contractId))
      .where(and(inBox, gte(ledgerEntries.date, from), lt(ledgerEntries.date, to)))
      .orderBy(asc(ledgerEntries.date), asc(ledgerEntries.createdAt), asc(ledgerEntries.id));

    let balance = new Decimal(opening?.balance ?? 0);
    const openingBalance = balance.toFixed(2);
    const entries = rows.map((r) => {
      const delta = r.direction === "debit" ? new Decimal(r.amount) : new Decimal(r.amount).negated();
      balance = balance.plus(delta);
      return {
        ...r,
        income: r.direction === "debit" ? r.amount : null,
        outcome: r.direction === "credit" ? r.amount : null,
        balance: balance.toFixed(2),
      };
    });
    const sum = (key: "income" | "outcome") => entries.reduce((t, e) => t.plus(e[key] ?? 0), new Decimal(0)).toFixed(2);
    return { account, openingBalance, entries, totalIn: sum("income"), totalOut: sum("outcome"), closingBalance: balance.toFixed(2) };
  });
}

export class CashError extends Error {}

export interface ManualMovementInput {
  type: "manual_income" | "manual_expense" | "transfer";
  date: string;
  cashAccountId: string;
  toCashAccountId: string | null;
  amount: string;
  notes: string;
}

/** Income, expense or transfer between boxes. The ledger posts it at commit. */
export async function recordManualMovement(input: ManualMovementInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const boxes = await tx
      .select()
      .from(cashAccounts)
      .where(and(eq(cashAccounts.organizationId, organizationId), isNull(cashAccounts.archivedAt)));
    const from = boxes.find((b) => b.id === input.cashAccountId);
    if (!from) throw new CashError("Elegí una caja o cuenta");
    let to: (typeof boxes)[number] | undefined;
    if (input.type === "transfer") {
      to = boxes.find((b) => b.id === input.toCashAccountId);
      if (!to) throw new CashError("Elegí la caja o cuenta destino");
      if (to.id === from.id) throw new CashError("El origen y el destino tienen que ser distintos");
      if (to.currency !== from.currency) throw new CashError("Solo se transfiere entre cajas de la misma moneda");
    }
    const [movement] = await tx
      .insert(movements)
      .values({
        organizationId,
        type: input.type,
        date: input.date,
        method: from.type === "bank" ? "transfer_to_admin" : "cash",
        cashAccountId: from.id,
        toCashAccountId: to?.id ?? null,
        amount: input.amount,
        currency: from.currency,
        notes: input.notes,
        createdBy: user.id,
      })
      .returning();
    return movement!;
  });
}

export async function createCashAccount(input: { type: "cash" | "bank"; name: string; currency: string }) {
  const { organizationId } = await requireRole("admin");
  return asUser((tx) => tx.insert(cashAccounts).values({ organizationId, ...input }).returning());
}

/** Archives a box; only when it's empty and isn't the default one. */
export async function archiveCashAccount(cashAccountId: string) {
  await requireRole("admin");
  const accounts = await listCashAccounts();
  const account = accounts.find((a) => a.id === cashAccountId);
  if (!account) throw new CashError("Caja inexistente");
  if (account.isDefault) throw new CashError("La caja principal no se archiva");
  if (!new Decimal(account.balance).isZero()) throw new CashError("Solo se archiva una caja con saldo cero: transferí antes el saldo");
  await asUser((tx) => tx.update(cashAccounts).set({ archivedAt: new Date() }).where(eq(cashAccounts.id, cashAccountId)));
}
