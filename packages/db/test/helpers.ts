/**
 * Shared fixtures for database tests. They run against the local Supabase
 * database (`pnpm exec supabase start`) and clean up what they create.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { createDbClients, type JwtClaims } from '../src/client';
import { invitations, organizations } from '../src/schema';

export function createTestDb() {
  const db = createDbClients(
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
  );
  const users: string[] = [];
  const orgs: string[] = [];

  async function createUser(name: string): Promise<TestUser> {
    const id = randomUUID();
    const email = `${name}-${id.slice(0, 8)}@test.rentavle.local`;
    await db.admin.execute(sql`
      insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
      values (${id}, ${email}, 'authenticated', 'authenticated',
              ${JSON.stringify({ first_name: name, last_name: 'Test' })}::jsonb, now(), now())
    `);
    users.push(id);
    return { id, email, claims: { sub: id, role: 'authenticated', email } };
  }

  async function createOrganization(user: TestUser, name: string): Promise<string> {
    const id = await db.withUser(user.claims, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        select public.create_organization(${name}, 'AR', 'ARS', 'America/Argentina/Buenos_Aires', 'es-AR') as id
      `);
      return rows[0]!.id;
    });
    orgs.push(id);
    return id;
  }

  async function invite(
    admin: TestUser,
    orgId: string,
    email: string,
    role: 'admin' | 'operator',
    expiresInMs = 86_400_000,
  ) {
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

  function acceptInvitation(user: TestUser, token: string) {
    return db.withUser(user.claims, (tx) => tx.execute(sql`select public.accept_invitation(${token})`));
  }

  /** Deletes an organization's ledger entries so the test can delete its movements and debts. */
  async function purgeLedger(orgId: string) {
    await db.admin.transaction(async (tx) => {
      await tx.execute(sql`select set_config('rentavle.purge_organization', ${orgId}, true)`);
      await tx.execute(sql`delete from public.ledger_entries where organization_id = ${orgId}`);
    });
  }

  async function cleanup() {
    if (orgs.length) await db.admin.delete(organizations).where(inArray(organizations.id, orgs));
    for (const id of users) {
      await db.admin.execute(sql`delete from auth.users where id = ${id}`);
    }
    await db.close();
  }

  return { db, createUser, createOrganization, invite, acceptInvitation, purgeLedger, cleanup };
}

export interface TestUser {
  id: string;
  email: string;
  claims: JwtClaims;
}

/** Drizzle wraps Postgres errors; the database message is in `cause`. */
export async function expectDbError(promise: Promise<unknown>, message: RegExp) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err as Error & { cause?: Error },
  );
  expect(error, 'expected the query to fail').not.toBeNull();
  expect(error?.cause?.message ?? error?.message).toMatch(message);
}
