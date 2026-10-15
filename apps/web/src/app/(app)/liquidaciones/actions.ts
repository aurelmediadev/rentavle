"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState, formValues } from "@/lib/forms";
import { SettlementError, recordSettlement } from "./data";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  method: z.enum(["cash", "transfer_from_admin"]),
  cashAccountId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .optional(),
});

export async function createSettlement(ownerId: string, currency: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const allocationIds = formData.getAll("allocationId").map(String);
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message]])), values: formValues(formData) };
  }
  if (allocationIds.length === 0) return { message: "Elegí al menos un cobro para liquidar", values: formValues(formData) };

  let settlement: { number: number };
  try {
    settlement = await recordSettlement({
      ownerId,
      currency,
      allocationIds,
      debtIds: formData.getAll("debtId").map(String),
      date: parsed.data.date,
      method: parsed.data.method,
      cashAccountId: parsed.data.cashAccountId ?? null,
      notes: parsed.data.notes ?? null,
    });
  } catch (error) {
    if (error instanceof SettlementError) return { message: error.message, values: formValues(formData) };
    const dbMessage = (error as { cause?: { message?: string } }).cause?.message;
    if (dbMessage) return { message: dbMessage, values: formValues(formData) };
    throw error;
  }
  revalidatePath("/liquidaciones");
  revalidatePath("/movimientos");
  revalidatePath("/contratos");
  redirect(`/movimientos/${settlement.number}?nuevo=1`);
}
