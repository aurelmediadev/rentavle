import "server-only";
import Decimal from "decimal.js";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";

const { charges, recurringCharges, chargeAllocations, movements } = schema;

export type ChargeRow = typeof charges.$inferSelect & { paid: string; outstanding: string };
export type RecurringChargeRow = typeof recurringCharges.$inferSelect;

export async function getContractCharges(contractId: string) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [list, templates] = await Promise.all([
      tx
        .select({
          charge: charges,
          // Paid by movements that weren't annulled.
          paid: sql<string>`coalesce((
            select sum(a.amount) from ${chargeAllocations} a
            join ${movements} m on m.id = a.movement_id
            where a.charge_id = "charges"."id" and m.reversed_at is null
          ), 0)`,
        })
        .from(charges)
        .where(and(eq(charges.organizationId, organizationId), eq(charges.contractId, contractId)))
        .orderBy(desc(charges.periodMonth), asc(charges.createdAt)),
      tx
        .select()
        .from(recurringCharges)
        .where(
          and(
            eq(recurringCharges.organizationId, organizationId),
            eq(recurringCharges.contractId, contractId),
            isNull(recurringCharges.deletedAt),
          ),
        )
        .orderBy(asc(recurringCharges.title)),
    ]);
    return {
      charges: list.map(({ charge, paid }) => ({
        ...charge,
        paid: new Decimal(paid).toFixed(2),
        outstanding: charge.status === "void" ? "0.00" : new Decimal(charge.amount).minus(paid).toFixed(2),
      })),
      templates,
    };
  });
}
