"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rentavle/db";
import { type NoticeSettings, parseNoticeSettings } from "@rentavle/domain";
import { type CommunicationType, DEFAULT_TEMPLATES, communicationTypes, unknownVariables } from "@rentavle/emails";
import { asUser, requireRole } from "@/lib/auth";
import { type FormState, formValues } from "@/lib/forms";

const { organizations, messageTemplates } = schema;

/** "1, 5, 10" → [1, 5, 10]; null if something isn't a valid day count. */
function dayList(value: FormDataEntryValue | null): number[] | null {
  const parts = String(value ?? "")
    .split(/[,;\s]+/)
    .filter(Boolean);
  const numbers = parts.map(Number);
  if (numbers.length === 0 || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
}

export async function saveNoticeSettings(_: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await requireRole("admin");
  const reminderDaysBefore = Number(formData.get("reminderDaysBefore"));
  const updateDaysBefore = Number(formData.get("updateDaysBefore"));
  const lateDays = dayList(formData.get("lateDays"));
  const expiryDaysBefore = dayList(formData.get("expiryDaysBefore"));
  const fieldErrors: Record<string, string[]> = {};
  if (!Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 1 || reminderDaysBefore > 30) fieldErrors.reminderDaysBefore = ["Entre 1 y 30 días"];
  if (!Number.isInteger(updateDaysBefore) || updateDaysBefore < 1 || updateDaysBefore > 60) fieldErrors.updateDaysBefore = ["Entre 1 y 60 días"];
  if (!lateDays) fieldErrors.lateDays = ["Días separados por comas, por ejemplo 1, 5, 10"];
  if (!expiryDaysBefore) fieldErrors.expiryDaysBefore = ["Días separados por comas, por ejemplo 60, 30"];
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: formValues(formData) };

  const notices: NoticeSettings = parseNoticeSettings({
    paymentReminder: formData.get("paymentReminder") === "on",
    reminderDaysBefore,
    lateNotice: formData.get("lateNotice") === "on",
    lateDays,
    amountUpdate: formData.get("amountUpdate") === "on",
    updateDaysBefore,
    contractExpiry: formData.get("contractExpiry") === "on",
    expiryDaysBefore,
  });
  await asUser(async (tx) => {
    const [org] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, organizationId));
    const settings = { ...((org?.settings as Record<string, unknown> | null) ?? {}), notices };
    await tx.update(organizations).set({ settings }).where(eq(organizations.id, organizationId));
  });
  revalidatePath("/configuracion/mensajes");
  return { ok: true, message: "Avisos guardados", values: formValues(formData) };
}

const templateSchema = z.object({
  emailSubject: z.string().trim().min(3, "Escribí el asunto").max(200),
  emailBody: z.string().trim().min(3, "Escribí el mensaje").max(5000),
  whatsappBody: z.string().trim().min(3, "Escribí el mensaje").max(2000),
});

export async function saveTemplate(type: CommunicationType, _: FormState, formData: FormData): Promise<FormState> {
  if (!communicationTypes.includes(type)) return { message: "Tipo inválido" };
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message]])), values: formValues(formData) };
  }
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, text] of Object.entries(parsed.data)) {
    const unknown = unknownVariables(type, text);
    if (unknown.length) fieldErrors[field] = [`Variables que no existen para este mensaje: ${unknown.map((v) => `{{${v}}}`).join(", ")}`];
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: formValues(formData) };

  const { organizationId } = await requireRole("admin");
  await asUser(async (tx, user) => {
    const versions = [
      { channel: "email" as const, subject: parsed.data.emailSubject, body: parsed.data.emailBody },
      { channel: "whatsapp" as const, subject: null, body: parsed.data.whatsappBody },
    ];
    for (const v of versions) {
      const where = and(eq(messageTemplates.organizationId, organizationId), eq(messageTemplates.type, type), eq(messageTemplates.channel, v.channel));
      const original = DEFAULT_TEMPLATES[type][v.channel];
      // Saving the default text again just removes the agency's version.
      if (v.body === original.body.trim() && (v.subject ?? null) === (original.subject?.trim() ?? null)) {
        await tx.delete(messageTemplates).where(where);
        continue;
      }
      await tx
        .insert(messageTemplates)
        .values({ organizationId, type, channel: v.channel, subject: v.subject, body: v.body, updatedBy: user.id })
        .onConflictDoUpdate({
          target: [messageTemplates.organizationId, messageTemplates.type, messageTemplates.channel],
          set: { subject: v.subject, body: v.body, updatedBy: user.id, updatedAt: new Date() },
        });
    }
  });
  revalidatePath("/configuracion/mensajes");
  return { ok: true, message: "Mensaje guardado" };
}

export async function resetTemplate(type: CommunicationType): Promise<FormState> {
  const { organizationId } = await requireRole("admin");
  await asUser((tx) => tx.delete(messageTemplates).where(and(eq(messageTemplates.organizationId, organizationId), eq(messageTemplates.type, type))));
  revalidatePath("/configuracion/mensajes");
  return { ok: true, message: "Se volvió al mensaje original" };
}
