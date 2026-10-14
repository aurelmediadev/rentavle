/**
 * Row Level Security: one organization never sees or changes another's data.
 * Runs against the local Supabase database (`pnpm exec supabase start`).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClients, type JwtClaims } from '../src/client';
import { invitations, memberships, organizations, profiles } from '../src/schema';

const db = createDbClients(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
);

interface TestUser {
  id: string;
  email: string;
  claims: JwtClaims;
}

const createdUsers: string[] = [];

async function createUser(name: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `${name}-${id.slice(0, 8)}@test.rentavle.local`;
  await db.admin.execute(sql`
    insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
    values (${id}, ${email}, 'authenticated', 'authenticated',
            ${JSON.stringify({ first_name: name, last_name: 'Test' })}::jsonb, now(), now())
  `);
  createdUsers.push(id);
  return { id, email, claims: { sub: id, role: 'authenticated', email } };
}

async function createOrganization(user: TestUser, name: string): Promise<string> {
  return db.withUser(user.claims, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select public.create_organization(${name}, 'AR', 'ARS', 'America/Argentina/Buenos_Aires', 'es-AR') as id
    `);
    return rows[0]!.id;
  });
}

async function invite(admin: TestUser, orgId: string, email: string, role: 'admin' | 'operator', expiresInMs = 86_400_000) {
  const token = randomBytes(32).toString('base64url');
  await db.withUser(admin.claims, (tx) =>
    tx.insert(invitations).values({
      organizationId: orgId,
      email,
      role,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      invitedBy: admin.id,
      expiresAt: new Date(Date.now() + expiresInMs),
    }),
  );
  return token;
}

/** Drizzle wraps Postgres errors; the database message is in `cause`. */
async function expectDbError(promise: Promise<unknown>, message: RegExp) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err as Error & { cause?: Error },
  );
  expect(error, 'expected the query to fail').not.toBeNull();
  expect(error?.cause?.message ?? error?.message).toMatch(message);
}

function acceptInvitation(user: TestUser, token: string) {
  return db.withUser(user.claims, (tx) => tx.execute(sql`select public.accept_invitation(${token})`));
}

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

afterAll(async () => {
  await db.admin.delete(organizations).where(sql`${organizations.id} in (${orgA}, ${orgB})`);
  for (const id of createdUsers) {
    await db.admin.execute(sql`delete from auth.users where id = ${id}`);
  }
  await db.close();
});

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
