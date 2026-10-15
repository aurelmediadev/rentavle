"use server";

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import { clientName, formatAddress } from "@/lib/format";

const { clients, clientContacts, properties, contracts, contractParties, movements } = schema;

export interface SearchResult {
  group: "Contratos" | "Clientes" | "Propiedades" | "Movimientos";
  label: string;
  detail: string;
  href: string;
}

const LIMIT = 5;
const MOVEMENT_LABEL: Record<string, string> = {
  tenant_payment: "Cobro",
  owner_settlement: "Liquidación",
  manual_income: "Ingreso",
  manual_expense: "Egreso",
  transfer: "Transferencia",
};

/** Escapes LIKE wildcards so "50%" searches for a literal percent. */
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Global search: contracts, clients, properties and movements of the active agency. */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2 && !/^#?\d+$/.test(q)) return [];
  const { organizationId } = await getActiveMembership();
  const like = likeOf(q);
  const number = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;
  const digits = q.replace(/\D/g, "");

  return asUser(async (tx) => {
    const address = sql`concat_ws(' ', ${properties.street}, ${properties.streetNumber}, ${properties.unit})`;
    const [clientRows, propertyRows, contractRows, movementRows] = await Promise.all([
      tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, organizationId),
            isNull(clients.deletedAt),
            or(
              ilike(sql`concat_ws(' ', ${clients.firstName}, ${clients.lastName})`, like),
              ilike(clients.companyName, like),
              digits.length >= 5 ? ilike(clients.docNumber, `%${digits}%`) : undefined,
              digits.length >= 5 ? ilike(clients.taxId, `%${digits}%`) : undefined,
              sql`exists (select 1 from ${clientContacts} cc where cc.client_id = ${clients.id} and cc.value ilike ${like})`,
              number !== null ? eq(clients.number, number) : undefined,
            ),
          ),
        )
        .orderBy(clients.lastName, clients.companyName)
        .limit(LIMIT),
      tx
        .select()
        .from(properties)
        .where(
          and(
            eq(properties.organizationId, organizationId),
            isNull(properties.deletedAt),
            or(ilike(address, like), number !== null ? eq(properties.number, number) : undefined),
          ),
        )
        .orderBy(properties.street)
        .limit(LIMIT),
      tx
        .select({ id: contracts.id, number: contracts.number, status: contracts.status, street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit })
        .from(contracts)
        .innerJoin(properties, eq(properties.id, contracts.propertyId))
        .where(
          and(
            eq(contracts.organizationId, organizationId),
            isNull(contracts.deletedAt),
            or(
              number !== null ? eq(contracts.number, number) : undefined,
              ilike(address, like),
              sql`exists (
                select 1 from ${contractParties} cp join ${clients} c on c.id = cp.client_id
                where cp.contract_id = "contracts"."id"
                  and (concat_ws(' ', c.first_name, c.last_name) ilike ${like} or c.company_name ilike ${like}))`,
            ),
          ),
        )
        .orderBy(desc(contracts.number))
        .limit(LIMIT),
      number !== null
        ? tx
            .select()
            .from(movements)
            .where(and(eq(movements.organizationId, organizationId), eq(movements.number, number)))
        : Promise.resolve([]),
    ]);

    const tenants = contractRows.length
      ? await tx
          .select({ contractId: contractParties.contractId, client: clients })
          .from(contractParties)
          .innerJoin(clients, eq(clients.id, contractParties.clientId))
          .where(and(inArray(contractParties.contractId, contractRows.map((c) => c.id)), eq(contractParties.role, "tenant")))
      : [];

    return [
      ...contractRows.map((c): SearchResult => ({
        group: "Contratos",
        label: `#${c.number} · ${formatAddress(c)}`,
        detail: [tenants.filter((t) => t.contractId === c.id).map((t) => clientName(t.client)).join(", "), c.status === "active" ? null : "Terminado"]
          .filter(Boolean)
          .join(" · "),
        href: `/contratos/${c.number}`,
      })),
      ...clientRows.map((c): SearchResult => ({
        group: "Clientes",
        label: clientName(c),
        detail: `Cliente #${c.number}`,
        href: `/clientes/${c.number}`,
      })),
      ...propertyRows.map((p): SearchResult => ({
        group: "Propiedades",
        label: formatAddress(p, true),
        detail: `Propiedad #${p.number}`,
        href: `/propiedades/${p.number}`,
      })),
      ...movementRows.map((m): SearchResult => ({
        group: "Movimientos",
        label: `${MOVEMENT_LABEL[m.type] ?? "Movimiento"} #${m.number}`,
        detail: m.reversedAt ? "Anulado" : m.date,
        href: `/movimientos/${m.number}`,
      })),
    ];
  });
}
