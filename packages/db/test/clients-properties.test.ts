/**
 * Clients and properties: isolation between agencies, correlative numbers and
 * ownership percentages.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '../src/client';
import { bankAccounts, clientContacts, clients, properties, propertyOwners } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, invite, acceptInvitation, cleanup } = createTestDb();

let alice: TestUser; // admin of A
let olga: TestUser; // operator of A
let bob: TestUser; // admin of B
let orgA: string;
let orgB: string;

async function insertClient(tx: Transaction, organizationId: string, firstName: string) {
  const [row] = await tx
    .insert(clients)
    .values({ organizationId, kind: 'person', firstName, lastName: 'Prueba' })
    .returning();
  return row!;
}

async function insertProperty(tx: Transaction, organizationId: string, street: string) {
  const [row] = await tx.insert(properties).values({ organizationId, street, streetNumber: '100' }).returning();
  return row!;
}

beforeAll(async () => {
  alice = await createUser('alice');
  olga = await createUser('olga');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  orgB = await createOrganization(bob, 'Inmobiliaria B');
  await acceptInvitation(olga, await invite(alice, orgA, olga.email, 'operator'));
});

afterAll(cleanup);

describe('clients', () => {
  it('numbers clients correlatively per organization', async () => {
    const a1 = await db.withUser(alice.claims, (tx) => insertClient(tx, orgA, 'Uno'));
    const a2 = await db.withUser(olga.claims, (tx) => insertClient(tx, orgA, 'Dos'));
    const b1 = await db.withUser(bob.claims, (tx) => insertClient(tx, orgB, 'Otro'));
    expect([a1.number, a2.number, b1.number]).toEqual([1, 2, 1]);
  });

  it('ignores numbers sent by the client and keeps them on update', async () => {
    const created = await db.withUser(alice.claims, async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({ organizationId: orgA, kind: 'company', companyName: 'Empresa SA', number: 999 })
        .returning();
      return row!;
    });
    expect(created.number).not.toBe(999);

    const [updated] = await db.withUser(alice.claims, (tx) =>
      tx.update(clients).set({ number: 500, companyName: 'Empresa SRL' }).where(eq(clients.id, created.id)).returning(),
    );
    expect(updated).toMatchObject({ number: created.number, companyName: 'Empresa SRL' });
  });

  it('requires a name that matches the kind', async () => {
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.insert(clients).values({ organizationId: orgA, kind: 'person', firstName: 'Solo' })),
      /clients_name_by_kind/,
    );
  });

  it('isolates clients between organizations', async () => {
    const seenByBob = await db.withUser(bob.claims, (tx) => tx.select().from(clients));
    expect(seenByBob.every((c) => c.organizationId === orgB)).toBe(true);

    await expectDbError(
      db.withUser(bob.claims, (tx) => insertClient(tx, orgA, 'Intruso')),
      /row-level security/,
    );
  });

  it('does not let a client be moved to another organization', async () => {
    const client = await db.withUser(alice.claims, (tx) => insertClient(tx, orgA, 'Fijo'));
    const [updated] = await db.withUser(alice.claims, (tx) =>
      tx.update(clients).set({ organizationId: orgB }).where(eq(clients.id, client.id)).returning(),
    );
    expect(updated?.organizationId).toBe(orgA);
  });

  it('only lets admins delete permanently', async () => {
    const client = await db.withUser(olga.claims, (tx) => insertClient(tx, orgA, 'Borrable'));
    const deletedByOperator = await db.withUser(olga.claims, (tx) =>
      tx.delete(clients).where(eq(clients.id, client.id)).returning(),
    );
    expect(deletedByOperator).toEqual([]);

    const deletedByAdmin = await db.withUser(alice.claims, (tx) =>
      tx.delete(clients).where(eq(clients.id, client.id)).returning(),
    );
    expect(deletedByAdmin).toHaveLength(1);
  });

  it('does not attach contacts or bank accounts to another organization’s client', async () => {
    const foreign = await db.withUser(bob.claims, (tx) => insertClient(tx, orgB, 'Ajeno'));

    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        tx.insert(clientContacts).values({ organizationId: orgA, clientId: foreign.id, type: 'email', value: 'x@y.com' }),
      ),
      /row-level security/,
    );
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        tx.insert(bankAccounts).values({
          organizationId: orgA,
          ownerType: 'client',
          clientId: foreign.id,
          cbu: '0000003100000000000001',
          currency: 'ARS',
        }),
      ),
      /row-level security/,
    );
  });

  it('lets operators manage client bank accounts but not the agency’s own', async () => {
    const client = await db.withUser(olga.claims, (tx) => insertClient(tx, orgA, 'Con cuenta'));
    await db.withUser(olga.claims, (tx) =>
      tx.insert(bankAccounts).values({ organizationId: orgA, ownerType: 'client', clientId: client.id, alias: 'pedro.mp', currency: 'ARS' }),
    );
    await expectDbError(
      db.withUser(olga.claims, (tx) =>
        tx.insert(bankAccounts).values({ organizationId: orgA, ownerType: 'organization', alias: 'inmo.banco', currency: 'ARS' }),
      ),
      /row-level security/,
    );
    await db.withUser(alice.claims, (tx) =>
      tx.insert(bankAccounts).values({ organizationId: orgA, ownerType: 'organization', alias: 'inmo.banco', currency: 'ARS' }),
    );
  });
});

describe('properties', () => {
  it('numbers properties per organization and requires a street', async () => {
    const p1 = await db.withUser(alice.claims, (tx) => insertProperty(tx, orgA, 'Corrientes'));
    expect(p1.number).toBe(1);
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.insert(properties).values({ organizationId: orgA, street: '  ' })),
      /properties_street_required/,
    );
  });

  it('accepts co-owners whose percentages add up to 100', async () => {
    const result = await db.withUser(alice.claims, async (tx) => {
      const property = await insertProperty(tx, orgA, 'Santa Fe');
      const owner1 = await insertClient(tx, orgA, 'Dueño1');
      const owner2 = await insertClient(tx, orgA, 'Dueño2');
      await tx.insert(propertyOwners).values([
        { organizationId: orgA, propertyId: property.id, clientId: owner1.id, ownershipPct: '60' },
        { organizationId: orgA, propertyId: property.id, clientId: owner2.id, ownershipPct: '40' },
      ]);
      return tx.select().from(propertyOwners).where(eq(propertyOwners.propertyId, property.id));
    });
    expect(result).toHaveLength(2);
  });

  it('rejects ownership that does not add up to 100 at commit', async () => {
    await expectDbError(
      db.withUser(alice.claims, async (tx) => {
        const property = await insertProperty(tx, orgA, 'Callao');
        const owner = await insertClient(tx, orgA, 'Parcial');
        await tx.insert(propertyOwners).values({ organizationId: orgA, propertyId: property.id, clientId: owner.id, ownershipPct: '50' });
      }),
      /deben sumar 100%/,
    );
  });

  it('does not mix properties and owners of different organizations', async () => {
    const foreignOwner = await db.withUser(bob.claims, (tx) => insertClient(tx, orgB, 'Dueño B'));
    await expectDbError(
      db.withUser(alice.claims, async (tx) => {
        const property = await insertProperty(tx, orgA, 'Rivadavia');
        await tx.insert(propertyOwners).values({ organizationId: orgA, propertyId: property.id, clientId: foreignOwner.id, ownershipPct: '100' });
      }),
      /row-level security/,
    );
  });

  it('isolates properties between organizations', async () => {
    const seenByBob = await db.withUser(bob.claims, (tx) => tx.select().from(properties));
    expect(seenByBob.every((p) => p.organizationId === orgB)).toBe(true);
  });

  it('keeps counters private', async () => {
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.execute(sql`select * from public.org_counters`)),
      /permission denied/,
    );
  });
});
