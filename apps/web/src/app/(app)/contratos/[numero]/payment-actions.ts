"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState, formValues } from "@/lib/forms";
import { parseLocaleDecimal } from "@/lib/numbers";
import { PaymentError, recordTenantPayment, reverseMovement } from "./payments-data";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  method: z.enum(["cash", "transfer_to_admin", "transfer_to_owner", "split_transfer"]),
  cashAccountId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .optional(),
});

export async function recordPayment(contractId: string, contractNumber: number, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const chargeIds = formData.getAll("chargeId").map(String);
  const rawReceived = String(formData.get("received") ?? "").trim();
  const received = rawReceived === "" ? null : parseLocaleDecimal(rawReceived);
  if (!parsed.success || chargeIds.length === 0 || (rawReceived !== "" && received === null)) {
    return {
      message: chargeIds.length === 0 ? "Elegí al menos una deuda" : undefined,
      fieldErrors: {
        ...(parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message]]))),
        ...(rawReceived !== "" && received === null ? { received: ["Monto inválido"] } : {}),
      },
      values: formValues(formData),
    };
  }

  let movement: { number: number };
  try {
    movement = await recordTenantPayment({
      contractId,
      date: parsed.data.date,
      chargeIds,
      chargeInterest: formData.get("chargeInterest") === "on",
      received,
      method: parsed.data.method,
      cashAccountId: parsed.data.cashAccountId ?? null,
      notes: parsed.data.notes ?? null,
    });
  } catch (error) {
    if (error instanceof PaymentError) return { message: error.message, values: formValues(formData) };
    const dbMessage = (error as { cause?: { message?: string } }).cause?.message;
    if (dbMessage) return { message: dbMessage, values: formValues(formData) };
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/movimientos");
  redirect(`/movimientos/${movement.number}?nuevo=1&contrato=${contractNumber}`);
}

const reverseSchema = z.object({ reason: z.string().trim().min(3, "Contá brevemente el motivo") });

export async function reversePayment(movementId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = reverseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: { reason: [parsed.error.issues[0]!.message] }, values: formValues(formData) };
  try {
    await reverseMovement(movementId, parsed.data.reason);
  } catch (error) {
    if (error instanceof PaymentError) return { message: error.message };
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/movimientos");
  return { ok: true, message: "Cobro anulado" };
}
