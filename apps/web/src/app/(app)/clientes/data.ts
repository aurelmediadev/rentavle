import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { schema, type Transaction } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import type { ClientInput } from "./client-input";

const { clients, clientContacts, bankAccounts, propertyOwners, properties } = schema;

export type ClientRow = typeof clients.$inferSelect;

/** Active (not archived) clients of the current organization, optionally filtered. */
export async function listClients(query?: string) {
  const { organizationId } = await getActiveMembership();
  const q = query?.trim();
  return asUser(async (tx) => {
    const filters = [eq(clients.organizationId, organizationId), isNull(clients.deletedAt)];
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(clients.firstName, like),
          ilike(clients.lastName, like),
          ilike(clients.companyName, like),
          ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
          ilike(clients.docNumber, `%${q.replace(/[.\s]/g, "")}%`),
          ilike(clients.taxId, `%${q.replace(/\D/g, "") || q}%`),
          sql`exists (select 1 from ${clientContacts} cc where cc.client_id = ${clients.id} and cc.value ilike ${like})`,
        )!,
      );
    }
    const rows = await tx
      .select()
      .from(clients)
      .where(and(...filters))
      .orderBy(desc(clients.number))
      .limit(200);

    const contacts = rows.length
      ? await tx
          .select()
          .from(clientContacts)
          .where(inArray(clientContacts.clientId, rows.map((r) => r.id)))
          .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt))
      : [];

    return rows.map((row) => ({
      ...row,
      email: contacts.find((c) => c.clientId === row.id && c.type === "email")?.value ?? null,
      phone: contacts.find((c) => c.clientId === row.id && c.type === "phone")?.value ?? null,
    }));
  });
}

/** Lightweight list for pickers (owners, tenants...). */
export async function listClientOptions() {
  const { organizationId } = await getActiveMembership();
  return asUser((tx) =>
    tx
      .select({
        id: clients.id,
        number: clients.number,
        kind: clients.kind,
        firstName: clients.firstName,
        lastName: clients.lastName,
        companyName: clients.companyName,
        docNumber: clients.docNumber,
      })
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), isNull(clients.deletedAt)))
      .orderBy(asc(clients.lastName), asc(clients.firstName), asc(clients.companyName)),
  );
}

export async function getClientByNumber(number: number) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.number, number)));
    if (!client) return null;

    const [contacts, accounts, owned] = await Promise.all([
      tx
        .select()
        .from(clientContacts)
        .where(eq(clientContacts.clientId, client.id))
        .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt)),
      tx
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.clientId, client.id), isNull(bankAccounts.deletedAt)))
        .orderBy(asc(bankAccounts.createdAt)),
      tx
        .select({
          number: properties.number,
          street: properties.street,
          streetNumber: properties.streetNumber,
          unit: properties.unit,
          city: properties.city,
          ownershipPct: propertyOwners.ownershipPct,
        })
        .from(propertyOwners)
        .innerJoin(properties, eq(properties.id, propertyOwners.propertyId))
        .where(and(eq(propertyOwners.clientId, client.id), isNull(properties.deletedAt)))
        .orderBy(asc(properties.number)),
    ]);
    return { client, contacts, accounts, owned };
  });
}

async function replaceContacts(tx: Transaction, organizationId: string, clientId: string, input: ClientInput) {
  await tx.delete(clientContacts).where(eq(clientContacts.clientId, clientId));
  if (input.contacts.length === 0) return;
  const firstOfType = new Set<string>();
  await tx.insert(clientContacts).values(
    input.contacts.map((c) => {
      const isPrimary = !firstOfType.has(c.type);
      firstOfType.add(c.type);
      return { organizationId, clientId, type: c.type, value: c.value, label: c.label, isPrimary };
    }),
  );
}

function clientColumns(input: ClientInput) {
  const { contacts: _contacts, ...columns } = input;
  return columns;
}

export async function insertClient(input: ClientInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const [created] = await tx
      .insert(clients)
      .values({ ...clientColumns(input), organizationId, createdBy: user.id })
      .returning({ id: clients.id, number: clients.number });
    await replaceContacts(tx, organizationId, created!.id, input);
    return created!;
  });
}

export async function updateClient(clientId: string, input: ClientInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [updated] = await tx
      .update(clients)
      .set(clientColumns(input))
      .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)))
      .returning({ id: clients.id, number: clients.number });
    if (!updated) return null;
    await replaceContacts(tx, organizationId, clientId, input);
    return updated;
  });
}

/** Archived clients disappear from lists and pickers but keep their history. */
export async function setClientArchived(clientId: string, archived: boolean) {
  const { organizationId } = await getActiveMembership();
  return asUser((tx) =>
    tx
      .update(clients)
      .set({ deletedAt: archived ? new Date() : null })
      .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId))),
  );
}
