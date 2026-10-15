"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rentavle/db";
import { dueDate, parseYearMonth } from "@rentavle/domain";
import { generateCharges } from "@rentavle/jobs";
import { asUser, getActiveMembership } from "@/lib/auth";
import { db } from "@/lib/db";
import { type FormState, formValues, validationError } from "@/lib/forms";
import { parseLocaleDecimal } from "@/lib/numbers";
import { assertWritable, readOnlyBlock } from "@/lib/subscription";

const { charges, recurringCharges, contracts } = schema;

const PARTIES = ["tenant", "owner"] as const;
const CREDITORS = ["owner", "administration", "tenant", "third_party"] as const;

async function loadContract(contractId: string) {
  const { organizationId } = await getActiveMembership();
  const contract = await asUser(async (tx) => {
    const [row] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)));
    return row;
  });
  if (!contract) throw new Error("Contrato inexistente");
  return contract;
}

function amountError(raw: unknown, allowNegative: boolean): { amount?: string; error?: string } {
  const amount = parseLocaleDecimal(String(raw ?? "").replace(/^-/, ""));
  if (!amount || new Decimal(amount).isZero()) return { error: "Ingresá el monto" };
  const negative = allowNegative && String(raw ?? "").trim().startsWith("-");
  return { amount: negative ? `-${amount}` : amount };
}

const oneOffSchema = z
  .object({
    kind: z.enum(["charge", "discount"]),
    title: z.string().trim().min(2, "Describí el concepto").max(120),
    month: z.string().regex(/^\d{4}-\d{2}$/, "Elegí el mes"),
    debtor: z.enum(PARTIES),
    creditor: z.enum(CREDITORS),
    appliesFee: z.literal("on").optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.debtor !== v.creditor, { message: "Quién paga y quién cobra no pueden ser el mismo", path: ["creditor"] });

/** Cargo o descuento único (a discount is stored as a negative amount). */
export async function addOneOffCharge(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const parsed = oneOffSchema.safeParse(Object.fromEntries(formData));
  const { amount, error } = amountError(formData.get("amount"), false);
  if (!parsed.success || error) {
    const state = parsed.success ? { values: formValues(formData) } : validationError(parsed.error, formData);
    return { ...state, fieldErrors: { ...state.fieldErrors, ...(error ? { amount: [error] } : {}) } };
  }
  const contract = await loadContract(contractId);
  const signed = parsed.data.kind === "discount" ? `-${amount}` : amount!;
  const month = parseYearMonth(parsed.data.month);

  await asUser((tx, user) =>
    tx.insert(charges).values({
      organizationId: contract.organizationId,
      contractId: contract.id,
      type: "one_off",
      periodMonth: `${parsed.data.month}-01`,
      title: parsed.data.title,
      amount: signed,
      currency: contract.currency,
      debtor: parsed.data.debtor,
      creditor: parsed.data.creditor,
      appliesFee: parsed.data.appliesFee === "on",
      dueDate: dueDate(month, contract.dueDay),
      notes: parsed.data.notes || null,
      createdBy: user.id,
    }),
  );
  revalidatePath("/contratos");
  return { ok: true, message: parsed.data.kind === "discount" ? "Descuento agregado" : "Cargo agregado" };
}

const recurringSchema = z
  .object({
    title: z.string().trim().min(2, "Ingresá el nombre (por ejemplo, Expensas)").max(80),
    startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Elegí el primer mes"),
    endMonth: z
      .string()
      .regex(/^(\d{4}-\d{2})?$/)
      .optional(),
    frequencyMonths: z.coerce.number().int().min(1).max(24),
    timing: z.enum(["in_advance", "in_arrears"]),
    debtor: z.enum(PARTIES),
    creditor: z.enum(CREDITORS),
    appliesFee: z.literal("on").optional(),
    requiresConfirmation: z.literal("on").optional(),
  })
  .refine((v) => v.debtor !== v.creditor, { message: "Quién paga y quién cobra no pueden ser el mismo", path: ["creditor"] })
  .refine((v) => !v.endMonth || v.endMonth >= v.startMonth, { message: "Tiene que ser posterior al inicio", path: ["endMonth"] });

export async function addRecurringCharge(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData));
  const { amount, error } = amountError(formData.get("amount"), false);
  if (!parsed.success || error) {
    const state = parsed.success ? { values: formValues(formData) } : validationError(parsed.error, formData);
    return { ...state, fieldErrors: { ...state.fieldErrors, ...(error ? { amount: [error] } : {}) } };
  }
  const contract = await loadContract(contractId);
  await asUser((tx, user) =>
    tx.insert(recurringCharges).values({
      organizationId: contract.organizationId,
      contractId: contract.id,
      title: parsed.data.title,
      currency: contract.currency,
      debtor: parsed.data.debtor,
      creditor: parsed.data.creditor,
      appliesFee: parsed.data.appliesFee === "on",
      startMonth: `${parsed.data.startMonth}-01`,
      endMonth: parsed.data.endMonth ? `${parsed.data.endMonth}-01` : null,
      frequencyMonths: parsed.data.frequencyMonths,
      timing: parsed.data.timing,
      lastAmount: amount!,
      requiresConfirmation: parsed.data.requiresConfirmation === "on",
      createdBy: user.id,
    }),
  );
  await generateCharges(db.admin, { now: new Date(), contractId: contract.id });
  revalidatePath("/contratos");
  return { ok: true, message: "Gasto recurrente agregado" };
}

export async function archiveRecurringCharge(recurringChargeId: string) {
  await assertWritable();
  const { organizationId } = await getActiveMembership();
  await asUser((tx) =>
    tx
      .update(recurringCharges)
      .set({ deletedAt: new Date() })
      .where(and(eq(recurringCharges.id, recurringChargeId), eq(recurringCharges.organizationId, organizationId))),
  );
  revalidatePath("/contratos");
}

/**
 * Confirms (or corrects) the amount of an unpaid debt, e.g. when the expensas
 * bill arrives. For recurring debts it also becomes the estimate for next months.
 */
export async function confirmChargeAmount(chargeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const { amount, error } = amountError(formData.get("amount"), true);
  if (error) return { fieldErrors: { amount: [error] }, values: formValues(formData) };
  const { organizationId } = await getActiveMembership();

  const result = await asUser(async (tx) => {
    const [charge] = await tx
      .select()
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.organizationId, organizationId)));
    if (!charge || charge.status !== "pending") return "No se puede modificar una deuda con pagos o anulada";
    if (charge.type === "rent") return "El alquiler se ajusta desde los períodos de actualización";
    await tx.update(charges).set({ amount: amount!, isConfirmed: true, calcExplanation: null }).where(eq(charges.id, charge.id));
    if (charge.recurringChargeId) {
      await tx.update(recurringCharges).set({ lastAmount: amount! }).where(eq(recurringCharges.id, charge.recurringChargeId));
    }
    return null;
  });
  if (result) return { message: result };
  revalidatePath("/contratos");
  return { ok: true, message: "Monto confirmado" };
}

const voidSchema = z.object({ reason: z.string().trim().min(3, "Contá brevemente el motivo") });

export async function voidCharge(chargeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const parsed = voidSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { organizationId } = await getActiveMembership();
  const updated = await asUser((tx) =>
    tx
      .update(charges)
      .set({ status: "void", voidedAt: new Date(), voidReason: parsed.data.reason })
      .where(and(eq(charges.id, chargeId), eq(charges.organizationId, organizationId), eq(charges.status, "pending")))
      .returning({ id: charges.id }),
  );
  if (updated.length === 0) return { message: "Solo se anulan deudas sin pagos" };
  revalidatePath("/contratos");
  return { ok: true, message: "Deuda anulada" };
}

/** "Cargar deudas del próximo mes": creates next month's debts now. */
export async function generateNextMonth(contractId: string) {
  await assertWritable();
  const contract = await loadContract(contractId);
  const result = await generateCharges(db.admin, { now: new Date(), contractId: contract.id, includeNextMonth: true });
  revalidatePath("/contratos");
  return result.rentCreated + result.recurringCreated;
}
