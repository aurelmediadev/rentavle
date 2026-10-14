/**
 * Row Level Security: one organization never sees or changes another's data.
 * Runs against the local Supabase database (`pnpm exec supabase start`).
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { invitations, memberships, organizations, profiles } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, invite, acceptInvitation, cleanup } = createTestDb();

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
  carol = await createUser('carol');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  orgB = await createOrganization(bob, 'Inmobiliaria B');
});

afterAll(cleanup);

describe('tenant isolation', () => {
  it('creates the organization with the creator as admin and a trial', async () => {
    const [org] = await db.admin.select().from(organizations).where(eq(organizations.id, orgA));
    expect(org?.subscriptionStatus).toBe('trialing');
    expect(org?.trialEndsAt).toBeInstanceOf(Date);

    const rows = await db.admin.select().from(memberships).where(eq(memberships.organizationId, orgA));
    expect(rows).toEqual([expect.objectContaining({ userId: alice.id, role: 'admin' })]);
  });

  it('only shows the organizations a user belongs to', async () => {
    const seenByAlice = await db.withUser(alice.claims, (tx) => tx.select().from(organizations));
    expect(seenByAlice.map((o) => o.id)).toEqual([orgA]);

    const seenByCarol = await db.withUser(carol.claims, (tx) => tx.select().from(organizations));
    expect(seenByCarol).toEqual([]);
  });

  it('does not let a user update another organization', async () => {
    const updated = await db.withUser(alice.claims, (tx) =>
      tx.update(organizations).set({ name: 'Hackeada' }).where(eq(organizations.id, orgB)).returning(),
    );
    expect(updated).toEqual([]);

    const [org] = await db.admin.select().from(organizations).where(eq(organizations.id, orgB));
    expect(org?.name).toBe('Inmobiliaria B');
  });

  it('does not let a user add themselves to another organization', async () => {
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        tx.insert(memberships).values({ organizationId: orgB, userId: alice.id, role: 'admin' }),
      ),
      /row-level security/,
    );
  });

  it('hides memberships and invitations of other organizations', async () => {
    await invite(bob, orgB, 'someone@example.com', 'operator');
    const result = await db.withUser(alice.claims, async (tx) => ({
      memberships: await tx.select().from(memberships).where(eq(memberships.organizationId, orgB)),
      invitations: await tx.select().from(invitations).where(eq(invitations.organizationId, orgB)),
    }));
    expect(result).toEqual({ memberships: [], invitations: [] });
  });

  it('does not let an admin create invitations for another organization', async () => {
    await expectDbError(invite(alice, orgB, 'intruder@example.com', 'admin'), /row-level security/);
  });

  it('denies anonymous requests', async () => {
    await expectDbError(
      db.admin.transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'anon', true)`);
        return tx.execute(sql`select id from public.organizations`);
      }),
      /permission denied/,
    );
  });
});

describe('invitations', () => {
  it('lets the invited email join with the given role', async () => {
    const token = await invite(alice, orgA, carol.email, 'operator');
    await acceptInvitation(carol, token);

    const seenByCarol = await db.withUser(carol.claims, (tx) => tx.select().from(organizations));
    expect(seenByCarol.map((o) => o.id)).toEqual([orgA]);

    const [membership] = await db.admin
      .select()
      .from(memberships)
      .where(sql`${memberships.organizationId} = ${orgA} and ${memberships.userId} = ${carol.id}`);
    expect(membership?.role).toBe('operator');
  });

  it('cannot be reused', async () => {
    const token = await invite(alice, orgA, carol.email, 'operator');
    await acceptInvitation(carol, token);
    await expectDbError(acceptInvitation(carol, token), /no es válida o venció/);
  });

  it('rejects a different email and expired invitations', async () => {
    const forSomeoneElse = await invite(alice, orgA, 'other@example.com', 'operator');
    await expectDbError(acceptInvitation(bob, forSomeoneElse), /otro email/);

    const expired = await invite(alice, orgA, bob.email, 'operator', -1000);
    await expectDbError(acceptInvitation(bob, expired), /no es válida o venció/);

    const seenByBob = await db.withUser(bob.claims, (tx) => tx.select().from(organizations));
    expect(seenByBob.map((o) => o.id)).toEqual([orgB]);
  });

  it('does not let operators invite people', async () => {
    await expectDbError(invite(carol, orgA, 'friend@example.com', 'admin'), /row-level security/);
  });

  it('shares profiles only between teammates', async () => {
    const seenByAlice = await db.withUser(alice.claims, (tx) => tx.select().from(profiles));
    const ids = seenByAlice.map((p) => p.id).sort();
    expect(ids).toEqual([alice.id, carol.id].sort());
    expect(ids).not.toContain(bob.id);
  });
});

describe('admins', () => {
  it('always keeps at least one admin', async () => {
    await expectDbError(
      db.withUser(bob.claims, (tx) =>
        tx.update(memberships).set({ role: 'operator' }).where(eq(memberships.organizationId, orgB)),
      ),
      /al menos un administrador/,
    );
  });

  it('does not let operators promote themselves', async () => {
    const updated = await db.withUser(carol.claims, (tx) =>
      tx
        .update(memberships)
        .set({ role: 'admin' })
        .where(sql`${memberships.organizationId} = ${orgA} and ${memberships.userId} = ${carol.id}`)
        .returning(),
    );
    expect(updated).toEqual([]);
  });
});
