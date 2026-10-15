import "server-only";
import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Transaction } from "@rentavle/db";
import { ownerDirectAmount } from "@rentavle/domain";
import { asUser, getActiveMembership } from "@/lib/auth";
import { issueReceipt } from "@/lib/documents";
import { type PlanCharge, buildPaymentPlan } from "./payment-plan";

const { charges, chargeAllocations, movements, contracts, cashAccounts, contractParties } = schema;

/** Open debts of a contract with what is still owed and the last payment date. */
export async function openCharges(tx: Transaction, contractId: string, ids?: string[]): Promise<PlanCharge[]> {
  const rows = await tx
    .select({
      id: charges.id,
      type: charges.type,
      title: charges.title,
      periodMonth: charges.periodMonth,
      dueDate: charges.dueDate,
      amount: charges.amount,
      paid: sql<string>`coalesce(sum(${chargeAllocations.amount}) filter (where ${movements.reversedAt} is null), 0)`,
      lastPaymentDate: sql<string | null>`max(${movements.date}) filter (where ${movements.reversedAt} is null)`,
    })
    .from(charges)
    .leftJoin(chargeAllocations, eq(chargeAllocations.chargeId, charges.id))
    .leftJoin(movements, eq(movements.id, chargeAllocations.movementId))
    .where(
      and(
        eq(charges.contractId, contractId),
        inArray(charges.status, ["pending", "partially_paid"]),
        eq(charges.debtor, "tenant"),
        ids ? inArray(charges.id, ids) : undefined,
      ),
    )
    .groupBy(charges.id)
    .orderBy(asc(charges.periodMonth), asc(charges.createdAt));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    periodMonth: r.periodMonth,
    dueDate: r.dueDate,
    outstanding: new Decimal(r.amount).minus(r.paid).toFixed(2),
    lastPaymentDate: r.lastPaymentDate,
  }));
}

export async function paymentFormData(contractId: string) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [contract] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)));
    if (!contract) return null;
    const [open, accounts] = await Promise.all([
      openCharges(tx, contract.id),
      tx
        .select({ id: cashAccounts.id, name: cashAccounts.name, type: cashAccounts.type, isDefault: cashAccounts.isDefault })
        .from(cashAccounts)
        .where(and(eq(cashAccounts.organizationId, organizationId), isNull(cashAccounts.archivedAt), eq(cashAccounts.currency, contract.currency)))
        .orderBy(desc(cashAccounts.isDefault), asc(cashAccounts.name)),
    ]);
    return { contract, open, accounts };
  });
}

export interface RecordPaymentInput {
  contractId: string;
  date: string;
  chargeIds: string[];
  chargeInterest: boolean;
  received: string | null;
  method: "cash" | "transfer_to_admin" | "transfer_to_owner" | "split_transfer";
  cashAccountId: string | null;
  notes: string | null;
}

export class PaymentError extends Error {}

/**
 * Records a tenant payment in one transaction: creates the late interest debts,
 * the movement, its allocations and, if more money arrived than owed, a saldo a
 * favor. The database validates every allocation and updates debt statuses.
 */
export async function recordTenantPayment(input: RecordPaymentInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const [contract] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, input.contractId), eq(contracts.organizationId, organizationId)));
    if (!contract) throw new PaymentError("Contrato inexistente");

    const selected = await openCharges(tx, contract.id, input.chargeIds);
    if (selected.length !== input.chargeIds.length) throw new PaymentError("Alguna deuda ya fue cobrada o anulada. Recargá la página.");
    if (selected.length === 0) throw new PaymentError("Elegí al menos una deuda");

    const plan = buildPaymentPlan({
      contract: {
        currency: contract.currency,
        lateInterestDailyPct: contract.lateInterestDailyPct,
        lateInterestFrom: contract.lateInterestFrom,
      },
      charges: selected,
      paymentDate: input.date,
      chargeInterest: input.chargeInterest,
      received: input.received,
    });

    const tenant = await tx
      .select({ clientId: contractParties.clientId })
      .from(contractParties)
      .where(and(eq(contractParties.contractId, contract.id), eq(contractParties.role, "tenant")))
      .limit(1);

    // Split transfer: the owners got everything in their favour minus the agency fee.
    let ownerDirect: string | null = null;
    if (input.method === "split_transfer") {
      const [owners, chargeRows] = await Promise.all([
        tx
          .select({ clientId: contractParties.clientId, sharePct: contractParties.sharePct })
          .from(contractParties)
          .where(and(eq(contractParties.contractId, contract.id), eq(contractParties.role, "owner"))),
        tx
          .select({ id: charges.id, type: charges.type, creditor: charges.creditor, appliesFee: charges.appliesFee, amount: charges.amount })
          .from(charges)
          .where(inArray(charges.id, input.chargeIds)),
      ]);
      const interestByKey = new Map(plan.interests.map((i) => [i.key, i]));
      const items = plan.allocation.allocations.flatMap((a) => {
        const interest = interestByKey.get(a.chargeId);
        const charge = interest
          ? { type: "late_interest", creditor: "owner", appliesFee: contract.feesOnLateInterest, amount: interest.amount }
          : chargeRows.find((c) => c.id === a.chargeId);
        if (!charge || charge.creditor !== "owner") return [];
        return [
          {
            allocationId: a.chargeId,
            chargeType: (charge.type === "rent" || charge.type === "late_interest" || charge.type === "one_off" ? charge.type : "other") as "rent" | "late_interest" | "one_off" | "other",
            appliesFee: charge.appliesFee,
            paid: a.amount,
            chargeAmount: charge.amount,
            fee: { type: contract.feeType, value: contract.feeValue },
          },
        ];
      });
      ownerDirect = ownerDirectAmount(items, owners.map((o) => ({ clientId: o.clientId, sharePct: o.sharePct ?? "100" })), contract.currency);
    }

    // Money paid straight to the owner never enters an agency account.
    const cashAccountId = input.method === "transfer_to_owner" ? null : input.cashAccountId;
    if (input.method !== "transfer_to_owner" && !cashAccountId) throw new PaymentError("Elegí la caja o cuenta destino");

    const [movement] = await tx
      .insert(movements)
      .values({
        organizationId,
        type: "tenant_payment",
        date: input.date,
        contractId: contract.id,
        clientId: tenant[0]?.clientId ?? null,
        method: input.method,
        cashAccountId,
        ownerDirectAmount: ownerDirect,
        amount: plan.received,
        currency: contract.currency,
        notes: input.notes,
        createdBy: user.id,
      })
      .returning();

    // Late interest becomes a debt of its own, linked to this payment.
    const interestIds = new Map<string, string>();
    for (const interest of plan.interests) {
      const [created] = await tx
        .insert(charges)
        .values({
          organizationId,
          contractId: contract.id,
          type: "late_interest",
          periodMonth: interest.periodMonth,
          title: "Punitorios",
          amount: interest.amount,
          currency: contract.currency,
          debtor: "tenant",
          creditor: "owner",
          appliesFee: contract.feesOnLateInterest,
          dueDate: input.date,
          calcExplanation: interest.explanation,
          sourceMovementId: movement!.id,
          createdBy: user.id,
        })
        .returning({ id: charges.id });
      interestIds.set(interest.key, created!.id);
    }

    const allocations = plan.allocation.allocations.map((a) => ({
      organizationId,
      movementId: movement!.id,
      chargeId: interestIds.get(a.chargeId) ?? a.chargeId,
      amount: a.amount,
    }));
    if (allocations.length) await tx.insert(chargeAllocations).values(allocations);

    if (new Decimal(plan.allocation.surplus).gt(0)) {
      await tx.insert(charges).values({
        organizationId,
        contractId: contract.id,
        type: "credit_balance",
        periodMonth: `${input.date.slice(0, 7)}-01`,
        title: "Saldo a favor",
        amount: `-${plan.allocation.surplus}`,
        currency: contract.currency,
        debtor: "tenant",
        creditor: "owner",
        dueDate: input.date,
        calcExplanation: `Pago de más en el cobro #${movement!.number}`,
        sourceMovementId: movement!.id,
        createdBy: user.id,
      });
    }
    await issueReceipt(tx, movement!.id, user.id);
    return movement!;
  });
}

/** Annuls a payment: frees its debts and voids what it created (interest, saldo a favor). */
export async function reverseMovement(movementId: string, reason: string) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const [movement] = await tx
      .select()
      .from(movements)
      .where(and(eq(movements.id, movementId), eq(movements.organizationId, organizationId)));
    if (!movement) throw new PaymentError("Movimiento inexistente");
    if (movement.reversedAt) throw new PaymentError("El movimiento ya está anulado");

    const created = await tx.select().from(charges).where(eq(charges.sourceMovementId, movement.id));
    for (const c of created) {
      if (c.status === "paid" || c.status === "partially_paid") {
        const usedElsewhere = await tx
          .select({ id: chargeAllocations.id })
          .from(chargeAllocations)
          .innerJoin(movements, eq(movements.id, chargeAllocations.movementId))
          .where(and(eq(chargeAllocations.chargeId, c.id), sql`${movements.id} <> ${movement.id}`, isNull(movements.reversedAt)));
        if (usedElsewhere.length) {
          throw new PaymentError(`"${c.title}" de este cobro ya se usó en otro cobro: anulá ese primero`);
        }
      }
    }

    await tx
      .update(movements)
      .set({ reversedAt: new Date(), reversedBy: user.id, reverseReason: reason })
      .where(eq(movements.id, movement.id));
    for (const c of created) {
      await tx
        .update(charges)
        .set({ status: "void", voidedAt: new Date(), voidReason: `Anulación del cobro #${movement.number}` })
        .where(and(eq(charges.id, c.id), inArray(charges.status, ["pending"])));
    }
    return movement;
  });
}
