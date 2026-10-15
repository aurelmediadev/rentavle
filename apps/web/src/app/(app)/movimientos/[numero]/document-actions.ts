"use server";

import { and, eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import { createDocumentLink } from "@/lib/documents";

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
