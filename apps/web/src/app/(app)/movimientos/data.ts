import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";

const { movements, contracts, properties, clients, cashAccounts, chargeAllocations, charges, profiles, settlementLines } = schema;

const listColumns = {
  movement: movements,
  contractNumber: contracts.number,
  property: { street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit },
  client: { kind: clients.kind, firstName: clients.firstName, lastName: clients.lastName, companyName: clients.companyName },
  account: cashAccounts.name,
};

export async function listMovements(opts: { contractId?: string; limit?: number } = {}) {
  const { organizationId } = await getActiveMembership();
  return asUser((tx) =>
    tx
      .select(listColumns)
      .from(movements)
      .leftJoin(contracts, eq(contracts.id, movements.contractId))
      .leftJoin(properties, eq(properties.id, contracts.propertyId))
      .leftJoin(clients, eq(clients.id, movements.clientId))
      .leftJoin(cashAccounts, eq(cashAccounts.id, movements.cashAccountId))
      .where(and(eq(movements.organizationId, organizationId), opts.contractId ? eq(movements.contractId, opts.contractId) : undefined))
      .orderBy(desc(movements.number))
      .limit(opts.limit ?? 200),
  );
}

export async function getMovementByNumber(number: number) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [row] = await tx
      .select({ ...listColumns, createdByFirst: profiles.firstName, createdByLast: profiles.lastName })
      .from(movements)
      .leftJoin(contracts, eq(contracts.id, movements.contractId))
      .leftJoin(properties, eq(properties.id, contracts.propertyId))
      .leftJoin(clients, eq(clients.id, movements.clientId))
      .leftJoin(cashAccounts, eq(cashAccounts.id, movements.cashAccountId))
      .leftJoin(profiles, eq(profiles.id, movements.createdBy))
      .where(and(eq(movements.organizationId, organizationId), eq(movements.number, number)));
    if (!row) return null;
    const [allocations, created, lines] = await Promise.all([
      tx
        .select({
          amount: chargeAllocations.amount,
          title: charges.title,
          type: charges.type,
          periodMonth: charges.periodMonth,
          installmentNumber: charges.installmentNumber,
          explanation: charges.calcExplanation,
        })
        .from(chargeAllocations)
        .innerJoin(charges, eq(charges.id, chargeAllocations.chargeId))
        .where(eq(chargeAllocations.movementId, row.movement.id))
        .orderBy(charges.periodMonth),
      tx
        .select({ id: charges.id, title: charges.title, amount: charges.amount, status: charges.status, type: charges.type })
        .from(charges)
        .where(and(eq(charges.sourceMovementId, row.movement.id), inArray(charges.type, ["adjustment", "fee"]))),
      tx
        .select({
          gross: settlementLines.gross,
          fee: settlementLines.fee,
          payout: settlementLines.payout,
          feeOwed: settlementLines.feeOwed,
          sharePct: settlementLines.sharePct,
          chargeType: charges.type,
          chargeTitle: charges.title,
          periodMonth: charges.periodMonth,
          contractNumber: contracts.number,
          paymentId: chargeAllocations.movementId,
        })
        .from(settlementLines)
        .innerJoin(chargeAllocations, eq(chargeAllocations.id, settlementLines.allocationId))
        .innerJoin(charges, eq(charges.id, chargeAllocations.chargeId))
        .innerJoin(contracts, eq(contracts.id, charges.contractId))
        .where(eq(settlementLines.settlementId, row.movement.id))
        .orderBy(charges.periodMonth),
    ]);
    const paymentNumbers = lines.length
      ? await tx
          .select({ id: movements.id, number: movements.number })
          .from(movements)
          .where(inArray(movements.id, [...new Set(lines.map((l) => l.paymentId))]))
      : [];
    return {
      ...row,
      allocations,
      credits: created.filter((c) => c.type === "adjustment"),
      ownerFees: created.filter((c) => c.type === "fee"),
      lines: lines.map((l) => ({ ...l, paymentNumber: paymentNumbers.find((p) => p.id === l.paymentId)?.number })),
    };
  });
}
