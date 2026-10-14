import "server-only";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import { currentMonthIn } from "@/lib/dates";
import { formatYearMonth, addMonths } from "@rentavle/domain";

const { rentPeriods, contracts, properties, contractParties, clients, indexSeries } = schema;

/**
 * Update periods to review: those starting this month or next month, plus any
 * earlier period still waiting for its index.
 */
export async function listDueUpdates() {
  const { organizationId, timezone } = await getActiveMembership();
  const current = currentMonthIn(timezone);
  const next = `${formatYearMonth(addMonths(current, 1))}-01`;
  const thisMonth = `${formatYearMonth(current)}-01`;

  return asUser(async (tx) => {
    const rows = await tx
      .select({
        period: rentPeriods,
        contract: {
          id: contracts.id,
          number: contracts.number,
          currency: contracts.currency,
          updateMode: contracts.updateMode,
          updateFrequencyMonths: contracts.updateFrequencyMonths,
          fixedUpdatePct: contracts.fixedUpdatePct,
        },
        property: { street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit },
        seriesName: indexSeries.name,
      })
      .from(rentPeriods)
      .innerJoin(contracts, eq(contracts.id, rentPeriods.contractId))
      .innerJoin(properties, eq(properties.id, contracts.propertyId))
      .leftJoin(indexSeries, eq(indexSeries.id, contracts.indexSeriesId))
      .where(
        and(
          eq(contracts.organizationId, organizationId),
          eq(contracts.status, "active"),
          isNull(contracts.deletedAt),
          sql`${rentPeriods.periodNumber} > 1`,
          or(
            and(sql`${rentPeriods.startMonth} >= ${thisMonth}`, lte(rentPeriods.startMonth, next)),
            and(sql`${rentPeriods.startMonth} < ${thisMonth}`, inArray(rentPeriods.status, ["pending", "pending_index", "provisional"])),
          ),
        ),
      )
      .orderBy(asc(rentPeriods.startMonth), asc(contracts.number));

    const ids = [...new Set(rows.map((r) => r.contract.id))];
    const tenants = ids.length
      ? await tx
          .select({
            contractId: contractParties.contractId,
            kind: clients.kind,
            firstName: clients.firstName,
            lastName: clients.lastName,
            companyName: clients.companyName,
          })
          .from(contractParties)
          .innerJoin(clients, eq(clients.id, contractParties.clientId))
          .where(and(inArray(contractParties.contractId, ids), eq(contractParties.role, "tenant")))
      : [];

    return {
      thisMonth,
      rows: rows.map((r) => ({ ...r, tenants: tenants.filter((t) => t.contractId === r.contract.id) })),
    };
  });
}

/** Latest stored values of the organization's country index series. */
export async function listLatestIndexValues() {
  const { countryCode } = await getActiveMembership();
  return asUser(async (tx) => {
    const series = await tx.select().from(indexSeries).where(eq(indexSeries.countryCode, countryCode)).orderBy(asc(indexSeries.code));
    const latest = await Promise.all(
      series.map((s) =>
        tx
          .select()
          .from(schema.indexValues)
          .where(eq(schema.indexValues.seriesId, s.id))
          .orderBy(sql`${schema.indexValues.date} desc`)
          .limit(s.frequency === "daily" ? 1 : 13),
      ),
    );
    return series.map((s, i) => ({ series: s, values: latest[i]! }));
  });
}
