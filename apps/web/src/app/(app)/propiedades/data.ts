import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import type { PropertyInput } from "./property-input";

const { properties, propertyOwners, clients } = schema;

const ownerColumns = {
  propertyId: propertyOwners.propertyId,
  clientId: clients.id,
  clientNumber: clients.number,
  kind: clients.kind,
  firstName: clients.firstName,
  lastName: clients.lastName,
  companyName: clients.companyName,
  ownershipPct: propertyOwners.ownershipPct,
};

export async function listProperties(query?: string) {
  const { organizationId } = await getActiveMembership();
  const q = query?.trim();
  return asUser(async (tx) => {
    const filters = [eq(properties.organizationId, organizationId), isNull(properties.deletedAt)];
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(sql`concat_ws(' ', ${properties.street}, ${properties.streetNumber}, ${properties.unit})`, like),
          ilike(properties.city, like),
          sql`exists (
            select 1 from ${propertyOwners} po join ${clients} c on c.id = po.client_id
            where po.property_id = ${properties.id}
              and concat_ws(' ', c.first_name, c.last_name, c.company_name) ilike ${like}
          )`,
        )!,
      );
    }
    const rows = await tx
      .select()
      .from(properties)
      .where(and(...filters))
      .orderBy(desc(properties.number))
      .limit(200);

    const owners = rows.length
      ? await tx
          .select(ownerColumns)
          .from(propertyOwners)
          .innerJoin(clients, eq(clients.id, propertyOwners.clientId))
          .where(inArray(propertyOwners.propertyId, rows.map((r) => r.id)))
          .orderBy(desc(propertyOwners.ownershipPct))
      : [];

    return rows.map((row) => ({ ...row, owners: owners.filter((o) => o.propertyId === row.id) }));
  });
}

export async function getPropertyByNumber(number: number) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [property] = await tx
      .select()
      .from(properties)
      .where(and(eq(properties.organizationId, organizationId), eq(properties.number, number)));
    if (!property) return null;
    const owners = await tx
      .select(ownerColumns)
      .from(propertyOwners)
      .innerJoin(clients, eq(clients.id, propertyOwners.clientId))
      .where(eq(propertyOwners.propertyId, property.id))
      .orderBy(desc(propertyOwners.ownershipPct), asc(clients.lastName));
    return { property, owners };
  });
}

function propertyColumns(input: PropertyInput) {
  const { owners: _owners, ...columns } = input;
  return columns;
}

export async function insertProperty(input: PropertyInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const [created] = await tx
      .insert(properties)
      .values({ ...propertyColumns(input), organizationId, createdBy: user.id })
      .returning({ id: properties.id, number: properties.number });
    await tx.insert(propertyOwners).values(
      input.owners.map((o) => ({ organizationId, propertyId: created!.id, clientId: o.clientId, ownershipPct: o.pct })),
    );
    return created!;
  });
}

export async function updateProperty(propertyId: string, input: PropertyInput) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [updated] = await tx
      .update(properties)
      .set(propertyColumns(input))
      .where(and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)))
      .returning({ id: properties.id, number: properties.number });
    if (!updated) return null;
    // Owners are replaced together; the 100% check runs at commit.
    await tx.delete(propertyOwners).where(eq(propertyOwners.propertyId, propertyId));
    await tx.insert(propertyOwners).values(
      input.owners.map((o) => ({ organizationId, propertyId, clientId: o.clientId, ownershipPct: o.pct })),
    );
    return updated;
  });
}

export async function setPropertyArchived(propertyId: string, archived: boolean) {
  const { organizationId } = await getActiveMembership();
  return asUser((tx) =>
    tx
      .update(properties)
      .set({ deletedAt: archived ? new Date() : null })
      .where(and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId))),
  );
}
