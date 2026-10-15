/** Internal admin panel: staff-only functions, access changes with a reason and an audit trail. */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizations, platformAdmins, platformAuditLog } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, cleanup } = createTestDb();

let staff: TestUser;
let alice: TestUser;
let orgId: string;

const call = <T extends Record<string, unknown>>(user: TestUser, query: ReturnType<typeof sql>) =>
  db.withUser(user.claims, (tx) => tx.execute<T>(query));

beforeAll(async () => {
  staff = await createUser('staff');
  alice = await createUser('alice');
  orgId = await createOrganization(alice, 'Inmobiliaria Piloto');
  await db.admin.insert(platformAdmins).values({ userId: staff.id });
});

afterAll(cleanup);

describe('internal admin panel', () => {
  it('is only for Rentavle staff', async () => {
    await expectDbError(call(alice, sql`select * from public.admin_organizations(null)`), /Solo para el equipo de Rentavle/);
    await expectDbError(call(alice, sql`select public.admin_organization_detail(${orgId})`), /Solo para el equipo de Rentavle/);
    await expectDbError(
      call(alice, sql`select public.admin_set_access(${orgId}, 'active', null, 0, null, 'me regalo acceso')`),
      /Solo para el equipo de Rentavle/,
    );
    // Agencies can't see who the staff is.
    expect(await db.withUser(alice.claims, (tx) => tx.select().from(platformAdmins))).toEqual([]);
  });

  it('lists and searches organizations with their usage', async () => {
    const rows = await call<{ id: string; name: string; owner_email: string; subscription_status: string }>(
      staff,
      sql`select * from public.admin_organizations('piloto')`,
    );
    expect(rows).toEqual([expect.objectContaining({ id: orgId, owner_email: alice.email, subscription_status: 'trialing' })]);
    const byEmail = await call<{ id: string }>(staff, sql`select * from public.admin_organizations(${alice.email})`);
    expect(byEmail.map((r) => r.id)).toContain(orgId);
  });

  it('changes access only with a reason, and logs before and after', async () => {
    await expectDbError(call(staff, sql`select public.admin_set_access(${orgId}, 'active', null, 0, null, '')`), /motivo/);
    await call(staff, sql`select public.admin_set_access(${orgId}, 'active', null, 0, null, 'Piloto: 6 meses sin cargo')`);
    const [org] = await db.admin.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org).toMatchObject({ subscriptionStatus: 'active', planId: null });

    await call(staff, sql`select public.admin_set_access(${orgId}, 'active', 'corporativo', 2, null, 'Pasa a Corporativo con 500 contratos')`);
    const [detail] = await call<{ d: { organization: { plan_code: string }; usage: { limit: number }; audit: { actor: string; details: { note: string } }[] } }>(
      staff,
      sql`select public.admin_organization_detail(${orgId}) as d`,
    );
    expect(detail!.d.organization.plan_code).toBe('corporativo');
    expect(detail!.d.usage.limit).toBe(500);
    expect(detail!.d.audit.map((a) => a.details.note)).toEqual(['Pasa a Corporativo con 500 contratos', 'Piloto: 6 meses sin cargo']);
    expect(detail!.d.audit[0]!.actor).toBe(staff.email);
    expect(await db.admin.select().from(platformAuditLog).where(eq(platformAuditLog.organizationId, orgId))).toHaveLength(2);
  });

  it('extends a trial to the end of the chosen day in the agency time zone', async () => {
    await call(staff, sql`select public.admin_set_access(${orgId}, 'trialing', null, 0, '2026-12-31'::date, 'Extiendo la prueba por la feria')`);
    const [org] = await db.admin.select().from(organizations).where(eq(organizations.id, orgId));
    // Buenos Aires is UTC-3: 31/12 23:59:59 there.
    expect(org!.trialEndsAt!.toISOString()).toBe('2027-01-01T02:59:59.000Z');
  });
});
