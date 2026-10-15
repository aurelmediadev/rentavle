import "server-only";
import Decimal from "decimal.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Transaction } from "@rentavle/db";
import type { ReceivedBy } from "@rentavle/domain";
import { asUser, getActiveMembership } from "@/lib/auth";
import { formatAddress } from "@/lib/format";
import { type OwnerDebt, type PendingItem, buildSettlementPlan } from "./settlement-plan";

const { charges, chargeAllocations, movements, contracts, contractParties, properties, clients, settlementLines } = schema;

const RECEIVED_BY: Record<string, ReceivedBy> = {
  cash: "agency",
  transfer_to_admin: "agency",
  online: "agency",
  transfer_to_owner: "owner_direct",
  split_transfer: "split",
};

/** Tenant payments in favour of an owner not yet settled to that owner. */
export async function pendingItems(tx: Transaction, organizationId: string, ownerId?: string): Promise<(PendingItem & { ownerId: string; currency: string })[]> {
  const rows = await tx
    .select({
      allocationId: chargeAllocations.id,
      paid: chargeAllocations.amount,
      chargeTitle: charges.title,
      chargeType: charges.type,
      chargeAmount: charges.amount,
      appliesFee: charges.appliesFee,
      currency: charges.currency,
      paymentNumber: movements.number,
      paymentDate: movements.date,
      method: movements.method,
      contractId: contracts.id,
      contractNumber: contracts.number,
      feeType: contracts.feeType,
      feeValue: contracts.feeValue,
      street: properties.street,
      streetNumber: properties.streetNumber,
      unit: properties.unit,
      ownerId: contractParties.clientId,
    })
    .from(chargeAllocations)
    .innerJoin(movements, eq(movements.id, chargeAllocations.movementId))
    .innerJoin(charges, eq(charges.id, chargeAllocations.chargeId))
    .innerJoin(contracts, eq(contracts.id, charges.contractId))
    .innerJoin(properties, eq(properties.id, contracts.propertyId))
    .innerJoin(contractParties, and(eq(contractParties.contractId, contracts.id), eq(contractParties.role, "owner")))
    .where(
      and(
        eq(chargeAllocations.organizationId, organizationId),
        eq(movements.type, "tenant_payment"),
        isNull(movements.reversedAt),
        eq(charges.creditor, "owner"),
        ownerId ? eq(contractParties.clientId, ownerId) : undefined,
        // Not settled yet to this owner by a settlement that is still valid.
        sql`not exists (
          select 1 from ${settlementLines} l join ${movements} s on s.id = l.settlement_id
          where l.allocation_id = ${chargeAllocations.id} and l.client_id = ${contractParties.clientId} and s.reversed_at is null
        )`,
      ),
    )
    .orderBy(movements.date, movements.number);
  if (rows.length === 0) return [];

  const owners = await tx
    .select({ contractId: contractParties.contractId, clientId: contractParties.clientId, sharePct: contractParties.sharePct })
    .from(contractParties)
    .where(and(inArray(contractParties.contractId, [...new Set(rows.map((r) => r.contractId))]), eq(contractParties.role, "owner")));

  return rows.map((r) => ({
    allocationId: r.allocationId,
    ownerId: r.ownerId,
    currency: r.currency,
    contractId: r.contractId,
    contractNumber: r.contractNumber,
    propertyLabel: formatAddress(r),
    paymentNumber: r.paymentNumber,
    paymentDate: r.paymentDate,
    chargeTitle: r.chargeType === "rent" ? "Alquiler" : r.chargeType === "late_interest" ? "Punitorios" : r.chargeTitle,
    chargeType: (["rent", "late_interest", "one_off", "adjustment"].includes(r.chargeType) ? r.chargeType : "other") as PendingItem["chargeType"],
    appliesFee: r.appliesFee,
    paid: r.paid,
    chargeAmount: r.chargeAmount,
    receivedBy: RECEIVED_BY[r.method] ?? "agency",
    feeType: r.feeType,
    feeValue: r.feeValue,
    owners: owners
      .filter((o) => o.contractId === r.contractId)
      .map((o) => ({ clientId: o.clientId, sharePct: o.sharePct ?? "100" })),
  }));
}

/** Debts the owner owes (fees, expenses at their charge), still open. */
export async function ownerDebts(tx: Transaction, organizationId: string, ownerId: string): Promise<(OwnerDebt & { currency: string })[]> {
  const rows = await tx
    .select({
      id: charges.id,
      contractId: charges.contractId,
      title: charges.title,
      periodMonth: charges.periodMonth,
      amount: charges.amount,
      currency: charges.currency,
      paid: sql<string>`coalesce((
        select sum(a.amount) from ${chargeAllocations} a join ${movements} m on m.id = a.movement_id
        where a.charge_id = "charges"."id" and m.reversed_at is null), 0)`,
    })
    .from(charges)
    .innerJoin(contractParties, and(eq(contractParties.contractId, charges.contractId), eq(contractParties.role, "owner")))
    .where(
      and(
        eq(charges.organizationId, organizationId),
        eq(charges.debtor, "owner"),
        inArray(charges.status, ["pending", "partially_paid"]),
        eq(contractParties.clientId, ownerId),
        sql`${charges.amount} > 0`,
        // Debts of a specific co-owner only show up for that owner.
        sql`(${charges.debtorClientId} is null or ${charges.debtorClientId} = ${ownerId})`,
      ),
    );
  return rows.map((r) => ({ ...r, outstanding: new Decimal(r.amount).minus(r.paid).toFixed(2) }));
}

/** Owners with money to settle, for the overview page. */
export async function listOwnersToSettle() {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const items = await pendingItems(tx, organizationId);
    const byOwner = new Map<string, { currency: string; items: typeof items }>();
    for (const item of items) {
      const key = `${item.ownerId}|${item.currency}`;
      const entry = byOwner.get(key) ?? { currency: item.currency, items: [] };
      entry.items.push(item);
      byOwner.set(key, entry);
    }
    const ownerIds = [...new Set(items.map((i) => i.ownerId))];
    const people = ownerIds.length ? await tx.select().from(clients).where(inArray(clients.id, ownerIds)) : [];
    return [...byOwner.entries()].map(([key, { currency, items: ownerItems }]) => {
      const ownerId = key.split("|")[0]!;
      const plan = buildSettlementPlan({ ownerId, currency, items: ownerItems, debts: [] });
      return {
        owner: people.find((p) => p.id === ownerId)!,
        currency,
        contracts: [...new Set(ownerItems.map((i) => i.contractNumber))],
        payments: ownerItems.length,
        gross: plan.gross,
        fee: plan.fee,
        payout: plan.payoutBeforeDebts,
      };
    });
  });
}

export async function settlementFormData(ownerNumber: number) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [owner] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.number, ownerNumber)));
    if (!owner) return null;
    const [items, debts, accounts] = await Promise.all([
      pendingItems(tx, organizationId, owner.id),
      ownerDebts(tx, organizationId, owner.id),
      tx
        .select({ id: schema.cashAccounts.id, name: schema.cashAccounts.name, currency: schema.cashAccounts.currency, isDefault: schema.cashAccounts.isDefault })
        .from(schema.cashAccounts)
        .where(and(eq(schema.cashAccounts.organizationId, organizationId), isNull(schema.cashAccounts.archivedAt))),
    ]);
    return { owner, items, debts, accounts };
  });
}

export class SettlementError extends Error {}

export interface RecordSettlementInput {
  ownerId: string;
  currency: string;
  allocationIds: string[];
  debtIds: string[];
  date: string;
  method: "cash" | "transfer_from_admin";
  cashAccountId: string | null;
  notes: string | null;
}

/**
 * Records an owner settlement: the payout movement, one line per settled
 * payment, deductions of the owner's debts and, when the tenant paid the owner
 * directly, a fee debt of the owner. The database rejects settling twice.
 */
export async function recordSettlement(input: RecordSettlementInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const items = (await pendingItems(tx, organizationId, input.ownerId)).filter(
      (i) => input.allocationIds.includes(i.allocationId) && i.currency === input.currency,
    );
    if (items.length !== input.allocationIds.length) {
      throw new SettlementError("Algún cobro ya fue liquidado o anulado. Recargá la página.");
    }
    if (items.length === 0) throw new SettlementError("Elegí al menos un cobro para liquidar");
    const debts = (await ownerDebts(tx, organizationId, input.ownerId)).filter(
      (d) => input.debtIds.includes(d.id) && d.currency === input.currency,
    );
    const plan = buildSettlementPlan({ ownerId: input.ownerId, currency: input.currency, items, debts });

    const needsAccount = new Decimal(plan.net).gt(0);
    if (needsAccount && !input.cashAccountId) throw new SettlementError("Elegí de qué caja o cuenta sale el dinero");

    const contractIds = [...new Set(items.map((i) => i.contractId))];
    const [settlement] = await tx
      .insert(movements)
      .values({
        organizationId,
        type: "owner_settlement",
        date: input.date,
        contractId: contractIds.length === 1 ? contractIds[0]! : null,
        clientId: input.ownerId,
        method: input.method,
        cashAccountId: needsAccount ? input.cashAccountId : null,
        amount: plan.net,
        currency: input.currency,
        notes: input.notes,
        createdBy: user.id,
      })
      .returning();

    await tx.insert(settlementLines).values(
      plan.lines.map((l) => ({
        organizationId,
        settlementId: settlement!.id,
        allocationId: l.allocationId,
        clientId: l.clientId,
        sharePct: l.sharePct,
        gross: l.gross,
        fee: l.fee,
        payout: l.payout,
        feeOwed: l.feeOwed,
      })),
    );

    if (plan.deductions.length) {
      await tx.insert(chargeAllocations).values(
        plan.deductions.map((d) => ({ organizationId, movementId: settlement!.id, chargeId: d.debtId, amount: d.amount })),
      );
    }

    // Fees the owner owes because the tenant paid them directly, one debt per contract.
    const owedByContract = new Map<string, Decimal>();
    for (const line of plan.lines) {
      if (new Decimal(line.feeOwed).gt(0)) {
        owedByContract.set(line.item.contractId, (owedByContract.get(line.item.contractId) ?? new Decimal(0)).plus(line.feeOwed));
      }
    }
    for (const [contractId, amount] of owedByContract) {
      await tx.insert(charges).values({
        organizationId,
        contractId,
        type: "fee",
        periodMonth: `${input.date.slice(0, 7)}-01`,
        title: "Honorarios de administración",
        amount: amount.toFixed(2),
        currency: input.currency,
        debtor: "owner",
        debtorClientId: input.ownerId,
        creditor: "administration",
        dueDate: input.date,
        calcExplanation: `Cobros pagados directo al propietario (liquidación #${settlement!.number})`,
        sourceMovementId: settlement!.id,
        createdBy: user.id,
      });
    }
    return settlement!;
  });
}
