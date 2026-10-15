import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";

const { charges, recurringCharges } = schema;

export type ChargeRow = typeof charges.$inferSelect;
export type RecurringChargeRow = typeof recurringCharges.$inferSelect;

export async function getContractCharges(contractId: string) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [list, templates] = await Promise.all([
      tx
        .select()
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
    return { charges: list, templates };
  });
}
