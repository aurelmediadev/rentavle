import "server-only";
import { and, desc, eq, or } from "drizzle-orm";
import { getCountryPack } from "@rentavle/country";
import { schema, type Transaction } from "@rentavle/db";
import {
  type CommunicationType,
  DEFAULT_TEMPLATES,
  type TemplateChannel,
  createMailer,
  emailHtml,
  renderTemplate,
  senderAddress,
} from "@rentavle/emails";
import { asUser, getActiveMembership } from "@/lib/auth";
import { brandingUrl, createDocumentLink, documentFileName, renderIssuedDocument } from "@/lib/documents";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney } from "@/lib/numbers";

const { communications, messageTemplates, documents, movements, clients, clientContacts, contracts, properties, organizations } = schema;

const longDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" });

/** The agency's version of a template, or the default. */
export async function templateFor(tx: Transaction, organizationId: string, type: CommunicationType, channel: TemplateChannel) {
  const [own] = await tx
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.organizationId, organizationId), eq(messageTemplates.type, type), eq(messageTemplates.channel, channel)));
  return own ? { subject: own.subject, body: own.body } : DEFAULT_TEMPLATES[type][channel];
}

export interface DocumentDraft {
  documentId: string;
  type: "receipt" | "settlement";
  recipient: { clientId: string; name: string; emails: string[]; phones: { value: string; whatsapp: string | null }[] } | null;
  email: { subject: string; body: string };
  whatsapp: { body: string };
}

/**
 * Message to send a document to its client (tenant for receipts, owner for
 * settlements), with every variable filled except {{LINK}}: the public link is
 * created only when the message is actually sent.
 */
export async function documentDraft(documentId: string): Promise<DocumentDraft | null> {
  const { organizationId, countryCode } = await getActiveMembership();
  return asUser(async (tx) => {
    const [row] = await tx
      .select({ document: documents, movement: movements, org: organizations })
      .from(documents)
      .innerJoin(movements, eq(movements.id, documents.movementId))
      .innerJoin(organizations, eq(organizations.id, documents.organizationId))
      .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
    if (!row) return null;
    const { document, movement, org } = row;
    const [client] = movement.clientId ? await tx.select().from(clients).where(eq(clients.id, movement.clientId)) : [];
    const contacts = client ? await tx.select().from(clientContacts).where(eq(clientContacts.clientId, client.id)) : [];
    const [place] = movement.contractId
      ? await tx
          .select({ street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit })
          .from(contracts)
          .innerJoin(properties, eq(properties.id, contracts.propertyId))
          .where(eq(contracts.id, movement.contractId))
      : [];
    const pack = getCountryPack(countryCode);
    const byPriority = (a: { isPrimary: boolean }, b: { isPrimary: boolean }) => Number(b.isPrimary) - Number(a.isPrimary);

    const variables: Record<string, string> = {
      INMOBILIARIA: org.name,
      NOMBRE: client ? clientName(client) : "",
      NUMERO: String(document.number).padStart(8, "0"),
      MONTO: formatMoney(movement.amount, movement.currency),
      FECHA: longDate.format(new Date(`${movement.date}T00:00:00Z`)),
      DIRECCION: place ? formatAddress(place) : "",
      LINK: "{{LINK}}",
    };
    const [email, whatsapp] = await Promise.all([
      templateFor(tx, organizationId, document.type, "email"),
      templateFor(tx, organizationId, document.type, "whatsapp"),
    ]);
    return {
      documentId: document.id,
      type: document.type,
      recipient: client
        ? {
            clientId: client.id,
            name: clientName(client),
            emails: contacts.filter((c) => c.type === "email").sort(byPriority).map((c) => c.value.trim()),
            phones: contacts
              .filter((c) => c.type === "phone")
              .sort(byPriority)
              .map((c) => ({ value: c.value, whatsapp: pack.whatsappNumber(c.value) })),
          }
        : null,
      email: { subject: renderTemplate(email.subject ?? "", variables), body: renderTemplate(email.body, variables) },
      whatsapp: { body: renderTemplate(whatsapp.body, variables) },
    };
  });
}

export class CommunicationError extends Error {}

async function documentContext(tx: Transaction, organizationId: string, documentId: string) {
  const [row] = await tx
    .select({ document: documents, movement: movements, org: organizations })
    .from(documents)
    .innerJoin(movements, eq(movements.id, documents.movementId))
    .innerJoin(organizations, eq(organizations.id, documents.organizationId))
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
  if (!row) throw new CommunicationError("Documento inexistente");
  return row;
}

/**
 * Emails a document: records the communication, sends it with the PDF attached
 * and the public link in the text, and stores the result. A copy goes to the
 * agency's email (bcc) when it has one.
 */
export async function sendDocumentEmail(input: { documentId: string; to: string[]; subject: string; body: string }) {
  const { organizationId } = await getActiveMembership();
  const prepared = await asUser(async (tx, user) => {
    const { document, movement, org } = await documentContext(tx, organizationId, input.documentId);
    const link = await createDocumentLink(tx, document, user.id);
    const body = input.body.replaceAll("{{LINK}}", link.url);
    const [communication] = await tx
      .insert(communications)
      .values({
        organizationId,
        contractId: movement.contractId,
        clientId: movement.clientId,
        movementId: movement.id,
        type: document.type,
        channel: "email",
        sender: "manual",
        toAddress: input.to.join(", "),
        subject: input.subject,
        body,
        createdBy: user.id,
      })
      .returning();
    return { communication: communication!, document, org, body };
  });

  const { communication, document, org, body } = prepared;
  const mailer = createMailer();
  let result: { status: "sent"; providerMessageId: string } | { status: "failed"; error: string };
  try {
    const pdf = await renderIssuedDocument(document);
    const { id } = await mailer.send({
      from: senderAddress(org.name),
      replyTo: org.email,
      to: input.to.map((email) => ({ email })),
      bcc: org.email ? [org.email] : [],
      subject: input.subject,
      text: body,
      html: emailHtml({ agencyName: org.name, body, logoUrl: brandingUrl(org.logoPath) }),
      attachments: [{ filename: documentFileName(document), content: pdf }],
      tags: { communication: communication.id },
    });
    result = { status: "sent", providerMessageId: id };
  } catch (error) {
    result = { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Error al enviar" };
  }
  await asUser((tx) =>
    tx
      .update(communications)
      .set({ ...result, attempts: 1, sentAt: result.status === "sent" ? new Date() : null })
      .where(eq(communications.id, communication.id)),
  );
  return result;
}

/** Records a WhatsApp message and returns the wa.me link that opens it. */
export async function prepareDocumentWhatsapp(input: { documentId: string; phone: string; body: string }) {
  const { organizationId, countryCode } = await getActiveMembership();
  const number = getCountryPack(countryCode).whatsappNumber(input.phone);
  if (!number) throw new CommunicationError("No se pudo leer el teléfono para WhatsApp. Revisalo en la ficha del cliente.");
  return asUser(async (tx, user) => {
    const { document, movement } = await documentContext(tx, organizationId, input.documentId);
    const link = await createDocumentLink(tx, document, user.id);
    const body = input.body.replaceAll("{{LINK}}", link.url);
    await tx.insert(communications).values({
      organizationId,
      contractId: movement.contractId,
      clientId: movement.clientId,
      movementId: movement.id,
      type: document.type,
      channel: "whatsapp_link",
      sender: "manual",
      toAddress: `+${number}`,
      body,
      // WhatsApp opens on the user's device; we can't know if it was sent.
      status: "sent",
      sentAt: new Date(),
      createdBy: user.id,
    });
    return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
  });
}

/** Message history of a contract, client or movement (newest first). */
export async function communicationHistory(filter: { contractId?: string; clientId?: string; movementId?: string }) {
  const { organizationId } = await getActiveMembership();
  const conditions = [
    filter.contractId ? eq(communications.contractId, filter.contractId) : undefined,
    filter.clientId ? eq(communications.clientId, filter.clientId) : undefined,
    filter.movementId ? eq(communications.movementId, filter.movementId) : undefined,
  ].filter((c) => c !== undefined);
  return asUser((tx) =>
    tx
      .select({
        id: communications.id,
        type: communications.type,
        channel: communications.channel,
        sender: communications.sender,
        toAddress: communications.toAddress,
        subject: communications.subject,
        status: communications.status,
        error: communications.error,
        createdAt: communications.createdAt,
      })
      .from(communications)
      .where(and(eq(communications.organizationId, organizationId), or(...conditions)))
      .orderBy(desc(communications.createdAt))
      .limit(50),
  );
}

