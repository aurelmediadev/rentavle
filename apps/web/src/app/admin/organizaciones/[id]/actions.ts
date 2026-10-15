"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, formValues, validationError } from "@/lib/forms";
import { adminSetAccess } from "@/lib/platform";

const NONE = "none";

const accessSchema = z.object({
  status: z.enum(["trialing", "active", "past_due", "read_only", "cancelled"]),
  planCode: z.string().transform((v) => (v === NONE || v === "" ? null : v)),
  extraBlocks: z.coerce.number().int().min(0, "No puede ser negativo").max(100),
  trialEndsOn: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Fecha inválida")
    .transform((v) => v || null),
  note: z.string().trim().min(3, "Contá brevemente el motivo del cambio").max(500),
});

/** Staff change an agency's access: plan, status, extra blocks or trial end. Logged with the reason. */
export async function setAccess(organizationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = accessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  try {
    await adminSetAccess({ organizationId, ...parsed.data });
  } catch (error) {
    const message = (error as { cause?: { message?: string } }).cause?.message;
    if (message) return { message, values: formValues(formData) };
    throw error;
  }
  revalidatePath(`/admin/organizaciones/${organizationId}`);
  revalidatePath("/admin");
  return { ok: true, message: "Acceso actualizado" };
}
