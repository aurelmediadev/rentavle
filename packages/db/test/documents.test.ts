/** Documents: numbering per type, frozen once issued, voided with their movement, shared by token. */
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cashAccounts, documentLinks, documents, movements } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, purgeLedger, cleanup } = createTestDb();

let alice: TestUser;
let bob: TestUser;
let orgA: string;
let cashId: string;

const sha = (token: string) => createHash('sha256').update(token).digest('hex');

function movement(type: 'tenant_payment' | 'owner_settlement' | 'manual_income') {
  return db.withUser(alice.claims, async (tx) => {
    const [row] = await tx
      .insert(movements)
      .values({ organizationId: orgA, type, date: '2026-10-15', method: 'cash', cashAccountId: cashId, amount: type === 'owner_settlement' ? '0' : '1000', currency: 'ARS', createdBy: alice.id })
      .returning();
    return row!;
  });
}

function issue(movementId: string, type: 'receipt' | 'settlement') {
  return db.withUser(alice.claims, async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({ organizationId: orgA, type, movementId, data: { kind: type }, createdBy: alice.id })
      .returning();
    return row!;
  });
}

function shared(tokenHash: string) {
  return db.admin.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'anon', true)`);
    return tx.execute<{ type: string; number: number; status: string }>(sql`select * from public.shared_document(${tokenHash})`);
  });
}

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  await createOrganization(bob, 'Inmobiliaria B');
  const [cash] = await db.admin.select().from(cashAccounts).where(and(eq(cashAccounts.organizationId, orgA), eq(cashAccounts.isDefault, true)));
  cashId = cash!.id;
});

afterAll(async () => {
  await purgeLedger(orgA);
  await db.admin.delete(movements).where(eq(movements.organizationId, orgA));
  await cleanup();
});

describe('documents', () => {
  it('numbers receipts and settlements separately', async () => {
    const r1 = await issue((await movement('tenant_payment')).id, 'receipt');
    const s1 = await issue((await movement('owner_settlement')).id, 'settlement');
    const r2 = await issue((await movement('tenant_payment')).id, 'receipt');
    expect([r1.number, r2.number, s1.number]).toEqual([1, 2, 1]);
  });

  it('only issues the document that matches the movement, once', async () => {
    const payment = await movement('tenant_payment');
    await expectDbError(issue(payment.id, 'settlement'), /row-level security/);
    await expectDbError(issue((await movement('manual_income')).id, 'receipt'), /row-level security/);
    await issue(payment.id, 'receipt');
    await expectDbError(issue(payment.id, 'receipt'), /documents_movement_key/);
  });

  it('cannot be changed by users and is voided with its movement', async () => {
    const payment = await movement('tenant_payment');
    const doc = await issue(payment.id, 'receipt');
    const changed = await db.withUser(alice.claims, (tx) =>
      tx.update(documents).set({ data: { kind: 'otro' } }).where(eq(documents.id, doc.id)).returning(),
    ).catch((e: Error) => e);
    expect(changed).toBeInstanceOf(Error);

    await db.withUser(alice.claims, (tx) =>
      tx.update(movements).set({ reversedAt: new Date(), reversedBy: alice.id, reverseReason: 'prueba' }).where(eq(movements.id, payment.id)),
    );
    const [after] = await db.admin.select().from(documents).where(eq(documents.id, doc.id));
    expect(after?.status).toBe('void');
    expect(after?.data).toEqual({ kind: 'receipt' });
  });

  it('shares a document only with a valid, unexpired token and keeps it private otherwise', async () => {
    const doc = await issue((await movement('tenant_payment')).id, 'receipt');
    await db.withUser(alice.claims, (tx) =>
      tx.insert(documentLinks).values([
        { organizationId: orgA, documentId: doc.id, tokenHash: sha('vigente'), expiresAt: new Date(Date.now() + 86_400_000), createdBy: alice.id },
        { organizationId: orgA, documentId: doc.id, tokenHash: sha('vencido'), expiresAt: new Date(Date.now() - 1000), createdBy: alice.id },
      ]),
    );
    expect(await shared(sha('vigente'))).toEqual([expect.objectContaining({ type: 'receipt', number: doc.number, status: 'issued' })]);
    expect(await shared(sha('vencido'))).toHaveLength(0);
    expect(await shared(sha('inventado'))).toHaveLength(0);

    const seenByBob = await db.withUser(bob.claims, async (tx) => ({
      documents: await tx.select().from(documents),
      links: await tx.select().from(documentLinks),
    }));
    expect(seenByBob).toEqual({ documents: [], links: [] });
    await expectDbError(
      db.withUser(bob.claims, (tx) =>
        tx.insert(documentLinks).values({ organizationId: orgA, documentId: doc.id, tokenHash: sha('intruso'), expiresAt: new Date(), createdBy: bob.id }),
      ),
      /row-level security/,
    );
  });
});
