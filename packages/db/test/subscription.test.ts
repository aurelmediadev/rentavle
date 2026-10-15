/** Trial, read-only accounts and contract limits per plan. */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clients, contracts, organizations, plans, properties } from '../src/schema';
import { createTestDb, expectDbError, randomCuit, type TestUser } from './helpers';

const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
const orgs: string[] = [];

async function org() {
  const id = await createOrganization(alice, `Inmobiliaria ${orgs.length + 1}`);
  orgs.push(id);
  return id;
}

async function newContract(orgId: string, tx = db.admin) {
  const [property] = await tx.insert(properties).values({ organizationId: orgId, street: 'Ficticia' }).returning();
  return tx
    .insert(contracts)
    .values({ organizationId: orgId, propertyId: property!.id, startDate: '2026-01-01', endDate: '2027-12-31', originalEndDate: '2027-12-31', currency: 'ARS', initialAmount: '100000', firstBilledMonth: '2026-01-01' })
    .returning();
}

const asAlice = <T>(fn: Parameters<typeof db.withUser<T>>[1]) => db.withUser(alice.claims, fn);

beforeAll(async () => {
  alice = await createUser('alice');
});

afterAll(async () => {
  for (const id of orgs) await db.admin.delete(contracts).where(eq(contracts.organizationId, id));
  await cleanup();
});

describe('creating an organization', () => {
  it('always gives a 21-day trial and requires a tax id', async () => {
    const id = await org();
    const [row] = await db.admin.select().from(organizations).where(eq(organizations.id, id));
    const days = (row!.trialEndsAt!.getTime() - row!.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(21);

    await expectDbError(
      asAlice((tx) => tx.execute(sql`select public.create_organization('Sin CUIT', 'AR', 'ARS', 'America/Argentina/Buenos_Aires', 'es-AR', '')`)),
      /Falta el número fiscal/,
    );
    // The old signature that let the caller choose the trial length is gone.
    await expectDbError(
      asAlice((tx) =>
        tx.execute(sql`select public.create_organization('Larga', 'AR', 'ARS', 'America/Argentina/Buenos_Aires', 'es-AR', ${randomCuit()}, 3650)`),
      ),
      /function public\.create_organization.*does not exist/,
    );
  });
});

describe('read-only accounts', () => {
  it('blocks changes once the trial ends, but keeps reading and server jobs working', async () => {
    const id = await org();
    await asAlice((tx) => tx.insert(clients).values({ organizationId: id, kind: 'person', firstName: 'Ana', lastName: 'Antes' }));
    await db.admin.update(organizations).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(organizations.id, id));

    await expectDbError(
      asAlice((tx) => tx.insert(clients).values({ organizationId: id, kind: 'person', firstName: 'Ana', lastName: 'Después' })),
      /modo solo lectura/,
    );
    await expectDbError(asAlice((tx) => tx.update(clients).set({ notes: 'x' }).where(eq(clients.organizationId, id))), /modo solo lectura/);
    expect(await asAlice((tx) => tx.select().from(clients).where(eq(clients.organizationId, id)))).toHaveLength(1);
    await db.admin.insert(clients).values({ organizationId: id, kind: 'person', firstName: 'Job', lastName: 'Servidor' });

    // Subscribing (done by trusted code) unlocks it.
    await db.admin.update(organizations).set({ subscriptionStatus: 'active' }).where(eq(organizations.id, id));
    await asAlice((tx) => tx.insert(clients).values({ organizationId: id, kind: 'person', firstName: 'Ana', lastName: 'Suscripta' }));
  });

  it('does not let users pick their own plan', async () => {
    const id = await org();
    const [inicial] = await db.admin.select().from(plans).where(eq(plans.code, 'inicial'));
    await expectDbError(
      asAlice((tx) => tx.update(organizations).set({ planId: inicial!.id }).where(eq(organizations.id, id))),
      /No se puede cambiar/,
    );
    expect(await asAlice((tx) => tx.select().from(plans))).toHaveLength(3);
  });
});

describe('contract limits', () => {
  it('allows 10 active contracts during the trial', async () => {
    const id = await org();
    for (let i = 0; i < 10; i++) await asAlice((tx) => newContract(id, tx));
    await expectDbError(asAlice((tx) => newContract(id, tx)), /límite de 10 contratos activos/);

    // Ending one and starting another in the same transaction (a renewal) fits.
    await asAlice(async (tx) => {
      const [first] = await tx.select().from(contracts).where(eq(contracts.organizationId, id)).limit(1);
      await tx.update(contracts).set({ status: 'renewed' }).where(eq(contracts.id, first!.id));
      await newContract(id, tx);
    });
  });

  it('uses the plan limit plus extra blocks once subscribed', async () => {
    const id = await org();
    const [corporativo] = await db.admin.select().from(plans).where(eq(plans.code, 'corporativo'));
    const [inicial] = await db.admin.select().from(plans).where(eq(plans.code, 'inicial'));
    const limit = (planId: string, blocks = 0) =>
      db.admin.update(organizations).set({ subscriptionStatus: 'active', planId, extraContractBlocks: blocks }).where(eq(organizations.id, id));
    const current = async () => (await db.admin.execute<{ l: number | null }>(sql`select private.contract_limit(${id}) as l`))[0]!.l;

    await limit(inicial!.id);
    expect(await current()).toBe(40);
    await limit(corporativo!.id, 2);
    expect(await current()).toBe(500);
    await db.admin.update(organizations).set({ planId: null }).where(eq(organizations.id, id));
    expect(await current()).toBeNull();
  });
});
