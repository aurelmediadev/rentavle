/** Sample agency (onboarding): one per real agency, admins only, deleted as a whole. */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cashAccounts, movements, organizations, platformAdmins } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, invite, acceptInvitation, cleanup } = createTestDb();

let alice: TestUser;
let olga: TestUser;
let realOrg: string;

const createSample = (user: TestUser, parent: string) =>
  db.withUser(user.claims, async (tx) => (await tx.execute<{ id: string }>(sql`select public.create_sample_organization(${parent}) as id`))[0]!.id);
const deleteSample = (user: TestUser, org: string) => db.withUser(user.claims, (tx) => tx.execute(sql`select public.delete_sample_organization(${org})`));

beforeAll(async () => {
  alice = await createUser('alice');
  olga = await createUser('olga');
  realOrg = await createOrganization(alice, 'Inmobiliaria Real');
  await acceptInvitation(olga, await invite(alice, realOrg, olga.email, 'operator'));
});

afterAll(cleanup);

describe('sample agency', () => {
  it('is created by admins, once, as a trial without tax id', async () => {
    await expectDbError(createSample(olga, realOrg), /Solo un administrador/);
    const sample = await createSample(alice, realOrg);
    await expectDbError(createSample(alice, realOrg), /Ya tenés una inmobiliaria de ejemplo/);
    await expectDbError(createSample(alice, sample), /ya es una inmobiliaria de ejemplo/);

    const [row] = await db.admin.select().from(organizations).where(eq(organizations.id, sample));
    expect(row).toMatchObject({ name: 'Ejemplo · Inmobiliaria Real', isSample: true, sampleOf: realOrg, taxId: null, subscriptionStatus: 'trialing' });
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.update(organizations).set({ isSample: false, sampleOf: null }).where(eq(organizations.id, sample))),
      /No se puede cambiar/,
    );

    // Staff don't see samples in the internal panel.
    const staff = await createUser('staff');
    await db.admin.insert(platformAdmins).values({ userId: staff.id });
    const listed = await db.withUser(staff.claims, (tx) => tx.execute<{ id: string }>(sql`select id from public.admin_organizations(null)`));
    expect(listed.map((r) => r.id)).toContain(realOrg);
    expect(listed.map((r) => r.id)).not.toContain(sample);

    // Deleted as a whole, books included; never the real agency.
    const [box] = await db.admin.select().from(cashAccounts).where(and(eq(cashAccounts.organizationId, sample), eq(cashAccounts.isDefault, true)));
    await db.withUser(alice.claims, (tx) =>
      tx.insert(movements).values({ organizationId: sample, type: 'manual_income', date: '2026-10-15', method: 'cash', cashAccountId: box!.id, amount: '1000', currency: 'ARS', createdBy: alice.id }),
    );
    await expectDbError(deleteSample(alice, realOrg), /Solo se puede borrar una inmobiliaria de ejemplo/);
    await deleteSample(alice, sample);
    expect(await db.admin.select().from(organizations).where(eq(organizations.id, sample))).toEqual([]);
  });
});
