import "server-only";
import { createHash, randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { and, eq, inArray } from "drizzle-orm";
import { getCountryPack } from "@rentavle/country";
import { schema, type Transaction } from "@rentavle/db";
import { type AgencyInfo, type DocumentData, type DocumentMeta, type ReceiptData, type SettlementData, renderDocument } from "@rentavle/pdf";
import { env } from "@/lib/env";
import { clientName, formatAddress } from "@/lib/format";
import { optionLabel } from "@/lib/country";
import { PAYMENT_METHOD } from "@/app/(app)/movimientos/labels";

const { organizations, movements, clients, contracts, properties, charges, chargeAllocations, settlementLines, cashAccounts, documents, documentLinks } =
  schema;

/** Public URL of an image in the branding bucket. */
export function brandingUrl(path: string | null): string | null {
  return path ? `${env.supabaseUrl}/storage/v1/object/public/branding/${path}` : null;
}

const longMonth = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (isoDate: string) => longMonth.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));

function chargeConcept(c: { type: string; title: string; periodMonth: string; installmentNumber?: number | null }) {
  const month = monthLabel(c.periodMonth);
  if (c.type === "rent") return `Alquiler ${month}${c.installmentNumber ? ` (cuota ${c.installmentNumber})` : ""}`;
  if (c.type === "late_interest") return `Punitorios ${month}`;
  if (c.type === "credit_balance") return "Saldo a favor aplicado";
  return `${c.title} ${month}`;
}

type ClientRow = typeof clients.$inferSelect;

function clientId(client: ClientRow, countryCode: string): string | null {
  const pack = getCountryPack(countryCode);
  if (client.taxId) return `${pack.taxId.label} ${pack.taxId.format(client.taxId)}`;
  if (client.docNumber) return `${optionLabel(pack.identityDocuments, client.docType) ?? client.docType ?? ""} ${client.docNumber}`.trim();
  return null;
}

async function agencyInfo(tx: Transaction, organizationId: string) {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new Error("Organización inexistente");
  const pack = getCountryPack(org.countryCode);
  const agency: AgencyInfo = {
    name: org.name,
    legalName: org.legalName,
    taxIdLabel: pack.taxId.label,
    taxId: org.taxId ? pack.taxId.format(org.taxId) : null,
    taxCondition: optionLabel(pack.taxConditions, org.taxCondition),
    address: org.address,
    phone: org.phone,
    email: org.email,
    logoUrl: brandingUrl(org.logoPath),
    signatureUrl: brandingUrl(org.signaturePath),
    locale: org.locale,
  };
  return { org, pack, agency };
}

/**
 * Issues the receipt of a tenant payment, inside the transaction that records it.
 * Everything the PDF prints is frozen into documents.data.
 */
export async function issueReceipt(tx: Transaction, movementId: string, userId: string) {
  const [movement] = await tx.select().from(movements).where(eq(movements.id, movementId));
  if (!movement) throw new Error("Movimiento inexistente");
  const { org, pack, agency } = await agencyInfo(tx, movement.organizationId);

  const [payer] = movement.clientId ? await tx.select().from(clients).where(eq(clients.id, movement.clientId)) : [];
  const [place] = movement.contractId
    ? await tx
        .select({ number: contracts.number, street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit })
        .from(contracts)
        .innerJoin(properties, eq(properties.id, contracts.propertyId))
        .where(eq(contracts.id, movement.contractId))
    : [];
  const allocations = await tx
    .select({ amount: chargeAllocations.amount, type: charges.type, title: charges.title, periodMonth: charges.periodMonth, installmentNumber: charges.installmentNumber })
    .from(chargeAllocations)
    .innerJoin(charges, eq(charges.id, chargeAllocations.chargeId))
    .where(eq(chargeAllocations.movementId, movement.id))
    .orderBy(charges.periodMonth, charges.createdAt);
  const [credit] = await tx
    .select({ amount: charges.amount })
    .from(charges)
    .where(and(eq(charges.sourceMovementId, movement.id), eq(charges.type, "credit_balance")));

  const data: ReceiptData = {
    kind: "receipt",
    version: 1,
    agency,
    date: movement.date,
    currency: movement.currency,
    amount: movement.amount,
    amountInWords: pack.amountInWords(movement.amount, movement.currency),
    payer: { name: payer ? clientName(payer) : "—", taxId: payer ? clientId(payer, org.countryCode) : null },
    contractNumber: place?.number ?? null,
    property: place ? formatAddress(place) : null,
    lines: allocations.map((a) => ({ concept: chargeConcept(a), amount: a.amount })),
    credit: credit ? new Decimal(credit.amount).negated().toFixed(2) : null,
    method: PAYMENT_METHOD[movement.method] ?? movement.method,
    notes: movement.notes,
  };
  await tx.insert(documents).values({ organizationId: movement.organizationId, type: "receipt", movementId: movement.id, data, createdBy: userId });
}

/** Issues the settlement document of an owner settlement, inside its transaction. */
export async function issueSettlement(tx: Transaction, movementId: string, userId: string) {
  const [movement] = await tx.select().from(movements).where(eq(movements.id, movementId));
  if (!movement) throw new Error("Movimiento inexistente");
  const { org, pack, agency } = await agencyInfo(tx, movement.organizationId);
  const [owner] = movement.clientId ? await tx.select().from(clients).where(eq(clients.id, movement.clientId)) : [];

  const lines = await tx
    .select({
      gross: settlementLines.gross,
      fee: settlementLines.fee,
      payout: settlementLines.payout,
      sharePct: settlementLines.sharePct,
      type: charges.type,
      title: charges.title,
      periodMonth: charges.periodMonth,
      installmentNumber: charges.installmentNumber,
      contractNumber: contracts.number,
      paymentId: chargeAllocations.movementId,
    })
    .from(settlementLines)
    .innerJoin(chargeAllocations, eq(chargeAllocations.id, settlementLines.allocationId))
    .innerJoin(charges, eq(charges.id, chargeAllocations.chargeId))
    .innerJoin(contracts, eq(contracts.id, charges.contractId))
    .where(eq(settlementLines.settlementId, movement.id))
    .orderBy(contracts.number, charges.periodMonth);
  const payments = lines.length
    ? await tx
        .select({ id: movements.id, number: movements.number, method: movements.method })
        .from(movements)
        .where(inArray(movements.id, [...new Set(lines.map((l) => l.paymentId))]))
    : [];
  const deductions = await tx
    .select({ amount: chargeAllocations.amount, type: charges.type, title: charges.title, periodMonth: charges.periodMonth })
    .from(chargeAllocations)
    .innerJoin(charges, eq(charges.id, chargeAllocations.chargeId))
    .where(eq(chargeAllocations.movementId, movement.id));
  const ownerDebts = await tx
    .select({ title: charges.title, amount: charges.amount })
    .from(charges)
    .where(and(eq(charges.sourceMovementId, movement.id), eq(charges.type, "fee")));
  const [account] = movement.cashAccountId
    ? await tx.select({ name: cashAccounts.name }).from(cashAccounts).where(eq(cashAccounts.id, movement.cashAccountId))
    : [];

  const data: SettlementData = {
    kind: "settlement",
    version: 1,
    agency,
    date: movement.date,
    currency: movement.currency,
    owner: { name: owner ? clientName(owner) : "—", taxId: owner ? clientId(owner, org.countryCode) : null },
    lines: lines.map((l) => {
      const payment = payments.find((p) => p.id === l.paymentId);
      const direct = payment?.method === "transfer_to_owner" || payment?.method === "split_transfer";
      return {
        concept: chargeConcept(l),
        detail: [
          `Contrato #${l.contractNumber}`,
          payment ? `cobro #${payment.number}` : null,
          l.sharePct !== "100.00" ? `${new Decimal(l.sharePct).toString().replace(".", ",")}% del propietario` : null,
          direct ? "cobrado por el propietario" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        gross: l.gross,
        fee: l.fee,
        payout: l.payout,
      };
    }),
    deductions: deductions.map((d) => ({ concept: chargeConcept(d), amount: d.amount })),
    total: movement.amount,
    amountInWords: pack.amountInWords(movement.amount, movement.currency),
    method: PAYMENT_METHOD[movement.method] ?? movement.method,
    account: account?.name ?? null,
    ownerDebts: ownerDebts.map((d) => ({ concept: d.title, amount: d.amount })),
    notes: movement.notes,
  };
  await tx.insert(documents).values({ organizationId: movement.organizationId, type: "settlement", movementId: movement.id, data, createdBy: userId });
}

/** Downloads an image as a data URI; documents still render without it. */
async function dataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/png";
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderIssuedDocument(doc: { data: unknown } & DocumentMeta, format: "a4" | "half" = "a4") {
  const data = doc.data as DocumentData;
  const [logo, signature] = await Promise.all([dataUri(data.agency.logoUrl), dataUri(data.agency.signatureUrl)]);
  return renderDocument(data, { number: doc.number, status: doc.status }, { format, images: { logo, signature } });
}

export function documentFileName(doc: { type: string; number: number }) {
  return `${doc.type === "receipt" ? "recibo" : "liquidacion"}-${String(doc.number).padStart(8, "0")}.pdf`;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const LINK_DAYS = 30;

/** Creates a public link to a document; returns the URL (the token is only known now). */
export async function createDocumentLink(tx: Transaction, doc: { id: string; organizationId: string }, userId: string) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
  await tx.insert(documentLinks).values({ organizationId: doc.organizationId, documentId: doc.id, tokenHash: hashToken(token), expiresAt, createdBy: userId });
  return { url: `${env.siteUrl}/d/${token}`, expiresAt };
}
