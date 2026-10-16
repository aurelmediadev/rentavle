/** Attachments: only to the agency's own entities, under its own folder, invisible to others. */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clients, files } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
let bob: TestUser;
let orgA: string;
let orgB: string;
let clientA: string;
let clientB: string;

const attach = (user: TestUser, orgId: string, entityId: string, path: string) =>
  db.withUser(user.claims, (tx) =>
    tx
      .insert(files)
      .values({ organizationId: orgId, entityType: 'client', entityId, storagePath: path, filename: 'dni.pdf', mimeType: 'application/pdf', sizeBytes: 1000, createdBy: user.id })
      .returning(),
  );

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  orgB = await createOrganization(bob, 'Inmobiliaria B');
  const [a] = await db.admin.insert(clients).values({ organizationId: orgA, kind: 'person', firstName: 'Ana', lastName: 'A' }).returning();
  const [b] = await db.admin.insert(clients).values({ organizationId: orgB, kind: 'person', firstName: 'Beto', lastName: 'B' }).returning();
  clientA = a!.id;
  clientB = b!.id;
});

afterAll(cleanup);

describe('files', () => {
  it('attaches files to the agency own entities, under its folder', async () => {
    const [row] = await attach(alice, orgA, clientA, `${orgA}/client/${clientA}/x-dni.pdf`);
    expect(row).toMatchObject({ entityType: 'client', filename: 'dni.pdf' });

    // Another agency's client, or a path outside the agency's folder: rejected.
    await expectDbError(attach(alice, orgA, clientB, `${orgA}/client/${clientB}/y.pdf`), /row-level security/);
    await expectDbError(attach(alice, orgA, clientA, `${orgB}/client/${clientA}/z.pdf`), /row-level security/);
    await expectDbError(attach(bob, orgA, clientA, `${orgA}/client/${clientA}/w.pdf`), /row-level security/);
  });

  it('keeps them private and deletable by members', async () => {
    const [row] = await attach(alice, orgA, clientA, `${orgA}/client/${clientA}/borrar.pdf`);
    expect(await db.withUser(bob.claims, (tx) => tx.select().from(files))).toEqual([]);
    await db.withUser(bob.claims, (tx) => tx.delete(files).where(eq(files.id, row!.id)));
    expect(await db.admin.select().from(files).where(eq(files.id, row!.id))).toHaveLength(1);
    await db.withUser(alice.claims, (tx) => tx.delete(files).where(eq(files.id, row!.id)));
    expect(await db.admin.select().from(files).where(eq(files.id, row!.id))).toHaveLength(0);
  });
});
