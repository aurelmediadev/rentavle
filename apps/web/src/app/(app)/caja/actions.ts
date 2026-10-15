"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { z } from "zod";
import { type FormState, formValues, validationError } from "@/lib/forms";
import { parseLocaleDecimal } from "@/lib/numbers";
import { CashError, archiveCashAccount, createCashAccount, recordManualMovement } from "./data";

const movementSchema = z.object({
  type: z.enum(["manual_income", "manual_expense", "transfer"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  cashAccountId: z.uuid("Elegí una caja o cuenta"),
  toCashAccountId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  amount: z.string().trim().min(1, "Ingresá el monto"),
  notes: z.string().trim().min(3, "Contá brevemente el concepto").max(500),
});

function dbMessage(error: unknown) {
  return (error as { cause?: { message?: string } }).cause?.message;
}

export async function createManualMovement(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const amount = parseLocaleDecimal(parsed.data.amount);
  if (amount === null || new Decimal(amount).lte(0)) {
    return { fieldErrors: { amount: ["Monto inválido"] }, values: formValues(formData) };
  }

  let movement: { number: number };
  try {
    movement = await recordManualMovement({
      ...parsed.data,
      toCashAccountId: parsed.data.toCashAccountId ?? null,
      amount,
    });
  } catch (error) {
    if (error instanceof CashError) return { message: error.message, values: formValues(formData) };
    const message = dbMessage(error);
    if (message) return { message, values: formValues(formData) };
    throw error;
  }
  revalidatePath("/caja");
  revalidatePath("/movimientos");
  redirect(`/movimientos/${movement.number}`);
}

const accountSchema = z.object({
  type: z.enum(["cash", "bank"]),
  name: z.string().trim().min(2, "Ingresá un nombre").max(80),
  currency: z.string().regex(/^[A-Z]{3}$/, "Moneda inválida"),
});

export async function createCashAccountAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  try {
    await createCashAccount(parsed.data);
  } catch (error) {
    const message = dbMessage(error) ?? (error instanceof Error ? error.message : undefined);
    if (message) return { message, values: formValues(formData) };
    throw error;
  }
  revalidatePath("/caja");
  return { ok: true, message: "Caja creada" };
}

export async function archiveCashAccountAction(cashAccountId: string): Promise<FormState> {
  try {
    await archiveCashAccount(cashAccountId);
  } catch (error) {
    if (error instanceof Error) return { message: error.message };
    throw error;
  }
  revalidatePath("/caja");
  return { ok: true, message: "Caja archivada" };
}
