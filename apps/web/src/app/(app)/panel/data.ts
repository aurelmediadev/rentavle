import "server-only";
import Decimal from "decimal.js";
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { accessFor, addMonths, formatYearMonth } from "@rentavle/domain";
import { asUser, getActiveMembership } from "@/lib/auth";
import { addDays, currentMonthIn, todayIn } from "@/lib/dates";

const { contracts, contractParties, clients, properties, charges, chargeAllocations, movements, ledgerEntries, ledgerAccounts, organizations } = schema;

/** Amount per currency, e.g. { ARS: "1500000.00" }. */
export type Totals = Record<string, string>;

const toTotals = (rows: { currency: string; total: string | null }[]): Totals =>
  Object.fromEntries(rows.filter((r) => r.total !== null).map((r) => [r.currency, r.total!]));

/** Paid so far on a tenant debt (non-annulled payments). */
const paid = sql<string>`coalesce((
  select sum(a.amount) from ${chargeAllocations} a join ${movements} m on m.id = a.movement_id
  where a.charge_id = "charges"."id" and m.reversed_at is null), 0)`;

/** Everything the dashboard shows for the current month, in the agency's time zone. */
export async function dashboardSummary() {
  const { organizationId, timezone } = await getActiveMembership();
  const today = todayIn(timezone);
  const month = currentMonthIn(timezone);
  const monthStart = `${formatYearMonth(month)}-01`;
  const nextMonthStart = `${formatYearMonth(addMonths(month, 1))}-01`;
  const expiryLimit = addDays(today, 60);

  return asUser(async (tx) => {
    const tenantDebt = and(
      eq(charges.organizationId, organizationId),
      eq(charges.debtor, "tenant"),
      ne(charges.status, "void"),
      ne(charges.type, "credit_balance"),
      sql`${charges.amount} > 0`,
    );

    const [org, active, expiring, collected, monthDebts, overdue, fees] = await Promise.all([
      tx.select({ name: organizations.name, status: organizations.subscriptionStatus, trialEndsAt: organizations.trialEndsAt, currency: organizations.defaultCurrency })
        .from(organizations)
        .where(eq(organizations.id, organizationId)),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(contracts)
        .where(and(eq(contracts.organizationId, organizationId), eq(contracts.status, "active"), isNull(contracts.deletedAt))),
      tx
        .select({ id: contracts.id, number: contracts.number, endDate: contracts.endDate, street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit })
        .from(contracts)
        .innerJoin(properties, eq(properties.id, contracts.propertyId))
        .where(
          and(
            eq(contracts.organizationId, organizationId),
            eq(contracts.status, "active"),
            isNull(contracts.deletedAt),
            gte(contracts.endDate, today),
            lte(contracts.endDate, expiryLimit),
          ),
        )
        .orderBy(asc(contracts.endDate)),
      tx
        .select({ currency: movements.currency, total: sql<string | null>`sum(${movements.amount})` })
        .from(movements)
        .where(
          and(
            eq(movements.organizationId, organizationId),
            eq(movements.type, "tenant_payment"),
            isNull(movements.reversedAt),
            gte(movements.date, monthStart),
            lt(movements.date, nextMonthStart),
          ),
        )
        .groupBy(movements.currency),
      // This month's tenant debts: how much was billed and how much is still open.
      tx
        .select({
          currency: charges.currency,
          billed: sql<string>`sum(${charges.amount})`,
          outstanding: sql<string>`sum(${charges.amount} - ${paid})`,
        })
        .from(charges)
        .where(and(tenantDebt, eq(charges.periodMonth, monthStart)))
        .groupBy(charges.currency),
      // Overdue and unpaid, per contract.
      tx
        .select({
          contractId: charges.contractId,
          currency: charges.currency,
          outstanding: sql<string>`sum(${charges.amount} - ${paid})`,
          oldestDue: sql<string>`min(${charges.dueDate})`,
        })
        .from(charges)
        .where(and(tenantDebt, inArray(charges.status, ["pending", "partially_paid"]), lt(charges.dueDate, today)))
        .groupBy(charges.contractId, charges.currency)
        .orderBy(sql`min(${charges.dueDate})`),
      // Fees earned this month, from the books (reversals included).
      tx
        .select({
          currency: ledgerEntries.currency,
          total: sql<string | null>`sum(case ${ledgerEntries.direction} when 'credit' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end)`,
        })
        .from(ledgerEntries)
        .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
        .where(
          and(
            eq(ledgerEntries.organizationId, organizationId),
            eq(ledgerAccounts.type, "fees"),
            gte(ledgerEntries.date, monthStart),
            lt(ledgerEntries.date, nextMonthStart),
          ),
        )
        .groupBy(ledgerEntries.currency),
    ]);

    const overdueIds = [...new Set(overdue.map((o) => o.contractId))];
    const overdueContracts = overdueIds.length
      ? await tx
          .select({
            id: contracts.id,
            number: contracts.number,
            street: properties.street,
            streetNumber: properties.streetNumber,
            unit: properties.unit,
          })
          .from(contracts)
          .innerJoin(properties, eq(properties.id, contracts.propertyId))
          .where(inArray(contracts.id, overdueIds))
      : [];
    const contractIds = [...new Set([...overdueIds, ...expiring.map((e) => e.id)])];
    const tenants = contractIds.length
      ? await tx
          .select({ contractId: contractParties.contractId, kind: clients.kind, firstName: clients.firstName, lastName: clients.lastName, companyName: clients.companyName })
          .from(contractParties)
          .innerJoin(clients, eq(clients.id, contractParties.clientId))
          .where(and(inArray(contractParties.contractId, contractIds), eq(contractParties.role, "tenant")))
      : [];
    const tenantsOf = (id: string) => tenants.filter((t) => t.contractId === id);

    const overdueTotals: Totals = {};
    for (const o of overdue) overdueTotals[o.currency] = new Decimal(overdueTotals[o.currency] ?? 0).plus(o.outstanding).toFixed(2);

    return {
      org: org[0]!,
      // Same rule as the subscription page (exact hours left, rounded up).
      access: accessFor({ status: org[0]!.status, trialEndsAt: org[0]!.trialEndsAt }, new Date()),
      today,
      monthStart,
      activeContracts: active[0]?.count ?? 0,
      collected: toTotals(collected),
      billed: toTotals(monthDebts.map((d) => ({ currency: d.currency, total: d.billed }))),
      pending: toTotals(monthDebts.map((d) => ({ currency: d.currency, total: d.outstanding }))),
      overdueTotals,
      fees: toTotals(fees),
      overdue: overdue
        .map((o) => ({ ...o, contract: overdueContracts.find((c) => c.id === o.contractId)!, tenants: tenantsOf(o.contractId) }))
        .filter((o) => o.contract),
      expiring: expiring.map((e) => ({ ...e, tenants: tenantsOf(e.id) })),
    };
  });
}


/**
 * First steps (docs/02-funcionalidades.md §1): agency data → bank account → first
 * contract → first payment → team. Each step is done when the data exists.
 */
export async function onboardingState() {
  const { organizationId, role } = await getActiveMembership();
  return asUser(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, organizationId));
    const count = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
    const n = sql<number>`count(*)::int`;
    const [banks, contractsCount, payments, members, invitations, samples, parent] = await Promise.all([
      count(tx.select({ n }).from(schema.cashAccounts).where(and(eq(schema.cashAccounts.organizationId, organizationId), eq(schema.cashAccounts.type, "bank")))),
      count(tx.select({ n }).from(contracts).where(and(eq(contracts.organizationId, organizationId), isNull(contracts.deletedAt)))),
      count(tx.select({ n }).from(movements).where(and(eq(movements.organizationId, organizationId), eq(movements.type, "tenant_payment")))),
      count(tx.select({ n }).from(schema.memberships).where(eq(schema.memberships.organizationId, organizationId))),
      count(tx.select({ n }).from(schema.invitations).where(eq(schema.invitations.organizationId, organizationId))),
      tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.sampleOf, organizationId)),
      org?.sampleOf ? tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, org.sampleOf)) : Promise.resolve([]),
    ]);
    const steps = [
      { key: "agency", title: "Datos de la inmobiliaria", text: "Razón social, domicilio, logo y firma para los recibos.", href: "/configuracion/inmobiliaria", done: Boolean(org?.legalName && org.address) },
      { key: "bank", title: "Cuenta bancaria", text: "Si cobrás por transferencia, sumala como caja.", href: "/caja", done: banks > 0 },
      { key: "contract", title: "Primer contrato", text: "Con su propiedad, propietarios e inquilino. También los que están en curso.", href: "/contratos/nuevo", done: contractsCount > 0 },
      { key: "payment", title: "Primer cobro", text: "Registrá un pago: sale el recibo y la caja se actualiza sola.", href: "/contratos", done: payments > 0 },
      { key: "team", title: "Tu equipo", text: "Invitá a quienes trabajan con vos; los usuarios son ilimitados.", href: "/configuracion/usuarios", done: members + invitations > 1 },
    ];
    return {
      isAdmin: role === "admin",
      isSample: Boolean(org?.isSample),
      parentName: parent[0]?.name ?? null,
      hasSample: samples.length > 0,
      dismissed: Boolean(org?.onboardingCompletedAt),
      steps,
      done: steps.filter((s) => s.done).length,
    };
  });
}
