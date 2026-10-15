/** Communications: users record manual ones, only delivery changes; templates are admin-only. */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { communications, messageTemplates } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, invite, acceptInvitation, cleanup } = createTestDb();

let alice: TestUser;
let olga: TestUser;
let bob: TestUser;
let orgA: string;

const manual = (user: TestUser, over: Partial<typeof communications.$inferInsert> = {}) =>
  db.withUser(user.claims, async (tx) => {
    const [row] = await tx
      .insert(communications)
      .values({ organizationId: orgA, type: 'receipt', channel: 'email', sender: 'manual', toAddress: 'ana@example.com', subject: 'Recibo', body: 'Hola', createdBy: user.id, ...over })
      .returning();
    return row!;
  });

beforeAll(async () => {
  alice = await createUser('alice');
  olga = await createUser('olga');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  await createOrganization(bob, 'Inmobiliaria B');
  await acceptInvitation(olga, await invite(alice, orgA, olga.email, 'operator'));
});

afterAll(cleanup);

describe('communications', () => {
  it('lets members record what they send and update only its delivery', async () => {
    const row = await manual(olga);
    await db.withUser(olga.claims, (tx) =>
      tx.update(communications).set({ status: 'sent', providerMessageId: 'msg-1', sentAt: new Date() }).where(eq(communications.id, row.id)),
    );
    await expectDbError(
      db.withUser(olga.claims, (tx) => tx.update(communications).set({ body: 'Otro texto' }).where(eq(communications.id, row.id))),
      /no se modifica/,
    );
    await expectDbError(db.withUser(olga.claims, (tx) => tx.delete(communications).where(eq(communications.id, row.id))), /permission denied/);
  });

  it('leaves automatic notices to the job and hides everything from other agencies', async () => {
    await expectDbError(manual(alice, { sender: 'automatic', dedupeKey: 'x' }), /row-level security/);
    await expectDbError(manual(bob), /row-level security/);
    expect(await db.withUser(bob.claims, (tx) => tx.select().from(communications))).toEqual([]);
  });
});

describe('message templates', () => {
  it('are edited by admins and read by members', async () => {
    await db.withUser(alice.claims, (tx) =>
      tx.insert(messageTemplates).values({ organizationId: orgA, type: 'receipt', channel: 'whatsapp', body: 'Hola {{NOMBRE}}', updatedBy: alice.id }),
    );
    await expectDbError(
      db.withUser(olga.claims, (tx) => tx.insert(messageTemplates).values({ organizationId: orgA, type: 'late_notice', channel: 'email', body: 'x' })),
      /row-level security/,
    );
    expect(await db.withUser(olga.claims, (tx) => tx.select().from(messageTemplates))).toHaveLength(1);
    expect(await db.withUser(bob.claims, (tx) => tx.select().from(messageTemplates))).toEqual([]);
  });
});
