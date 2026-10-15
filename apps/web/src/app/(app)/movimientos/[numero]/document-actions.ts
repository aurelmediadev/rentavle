"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import { CommunicationError, prepareDocumentWhatsapp, sendDocumentEmail } from "@/lib/communications";
import { createDocumentLink } from "@/lib/documents";
import { type FormState, formValues, validationError } from "@/lib/forms";
import { READ_ONLY_MESSAGE, readOnlyBlock } from "@/lib/subscription";

export type ShareResult = { ok: true; url: string; expiresAt: string } | { ok: false; message: string };

/** Creates a public link (30 days) to send a document by email or WhatsApp. */
export async function shareDocument(documentId: string): Promise<ShareResult> {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const [doc] = await tx
      .select({ id: schema.documents.id, organizationId: schema.documents.organizationId })
      .from(schema.documents)
      .where(and(eq(schema.documents.id, documentId), eq(schema.documents.organizationId, organizationId)));
    if (!doc) return { ok: false, message: "Documento inexistente" };
    const link = await createDocumentLink(tx, doc, user.id);
    return { ok: true, url: link.url, expiresAt: link.expiresAt.toISOString() };
  });
}

const emailSchema = z.object({
  subject: z.string().trim().min(3, "Escribí el asunto").max(200),
  body: z.string().trim().min(3, "Escribí el mensaje").max(5000),
});

/** Emails the document to the chosen addresses (PDF attached, link in the text). */
export async function emailDocument(documentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const extra = String(formData.get("extra") ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const to = [...new Set([...formData.getAll("to").map(String), ...extra])];
  const invalid = to.filter((e) => !z.email().safeParse(e).success);
  if (invalid.length) return { fieldErrors: { extra: [`Email inválido: ${invalid.join(", ")}`] }, values: formValues(formData) };
  if (to.length === 0) return { message: "Elegí al menos un destinatario", values: formValues(formData) };

  try {
    const result = await sendDocumentEmail({ documentId, to, ...parsed.data });
    revalidatePath("/movimientos");
    revalidatePath("/contratos");
    if (result.status === "failed") return { message: `No se pudo enviar: ${result.error}`, values: formValues(formData) };
  } catch (error) {
    if (error instanceof CommunicationError) return { message: error.message, values: formValues(formData) };
    throw error;
  }
  return { ok: true, message: `Enviado a ${to.join(", ")}` };
}

export async function whatsappDocument(documentId: string, phone: string, body: string): Promise<ShareResult> {
  if (await readOnlyBlock()) return { ok: false, message: READ_ONLY_MESSAGE };
  if (body.trim().length < 3) return { ok: false, message: "Escribí el mensaje" };
  try {
    const url = await prepareDocumentWhatsapp({ documentId, phone, body: body.trim() });
    revalidatePath("/movimientos");
    revalidatePath("/contratos");
    return { ok: true, url, expiresAt: "" };
  } catch (error) {
    if (error instanceof CommunicationError) return { ok: false, message: error.message };
    throw error;
  }
}
