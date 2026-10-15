/** Collections: debt status kept by the database, overpayment and reversal rules. */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cashAccounts, chargeAllocations, charges, contracts, movements, properties } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, purgeLedger, cleanup } = createTestDb();

let alice: TestUser;
let bob: TestUser;
let orgA: string;
let orgB: string;
let contractId: string;
let boxId: string;

async function newCharge(amount: string, title = 'Alquiler') {
  const [c] = await db.withUser(alice.claims, (tx) =>
    tx
      .insert(charges)
      .values({
        organizationId: orgA,
        contractId,
        type: 'one_off',
        periodMonth: '2026-10-01',
        title,
        amount,
        currency: 'ARS',
        debtor: 'tenant',
        creditor: 'owner',
        dueDate: '2026-10-10',
      })
      .returning(),
  );
  return c!;
}

async function pay(chargeId: string, amount: string) {
  return db.withUser(alice.claims, async (tx) => {
    const [m] = await tx
      .insert(movements)
      .values({
        organizationId: orgA,
        type: 'tenant_payment',
        date: '2026-10-14',
        contractId,
        method: 'cash',
        cashAccountId: boxId,
        amount: amount.replace('-', ''),
        currency: 'ARS',
        createdBy: alice.id,
      })
      .returning();
    await tx.insert(chargeAllocations).values({ organizationId: orgA, movementId: m!.id, chargeId, amount });
    return m!;
  });
}

const statusOf = async (id: string) => (await db.admin.select().from(charges).where(eq(charges.id, id)))[0]!.status;

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  orgB = await createOrganization(bob, 'Inmobiliaria B');
  const [property] = await db.admin.insert(properties).values({ organizationId: orgA, street: 'Ficticia' }).returning();
  const [contract] = await db.admin
    .insert(contracts)
    .values({
      organizationId: orgA,
      propertyId: property!.id,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      originalEndDate: '2027-12-31',
      currency: 'ARS',
      initialAmount: '100000',
      firstBilledMonth: '2026-01-01',
    })
    .returning();
  contractId = contract!.id;
  const [box] = await db.admin.select().from(cashAccounts).where(eq(cashAccounts.organizationId, orgA));
  boxId = box!.id;
});

afterAll(async () => {
  await purgeLedger(orgA);
  await db.admin.delete(movements).where(eq(movements.organizationId, orgA));
  await db.admin.delete(charges).where(eq(charges.organizationId, orgA));
  await db.admin.delete(contracts).where(eq(contracts.organizationId, orgA));
  await cleanup();
});

describe('cash accounts', () => {
  it('every new agency gets a default box', async () => {
    const boxes = await db.withUser(alice.claims, (tx) => tx.select().from(cashAccounts));
    expect(boxes).toEqual([expect.objectContaining({ name: 'Caja principal', type: 'cash', isDefault: true, currency: 'ARS' })]);
  });

  it('only admins create accounts', async () => {
    const seenByBob = await db.withUser(bob.claims, (tx) => tx.select().from(cashAccounts));
    expect(seenByBob.every((b) => b.organizationId === orgB)).toBe(true);
  });
});

describe('allocations and debt status', () => {
  it('moves a debt from pending to partially paid to paid', async () => {
    const charge = await newCharge('500000');
    await pay(charge.id, '200000');
    expect(await statusOf(charge.id)).toBe('partially_paid');
    await pay(charge.id, '300000');
    expect(await statusOf(charge.id)).toBe('paid');
  });

  it('rejects paying more than owed', async () => {
    const charge = await newCharge('100000');
    await pay(charge.id, '60000');
    await expectDbError(pay(charge.id, '50000'), /supera lo adeudado/);
  });

  it('applies credits with negative allocations', async () => {
    const credit = await newCharge('-10000', 'Saldo a favor');
    await pay(credit.id, '-10000');
    expect(await statusOf(credit.id)).toBe('paid');
    await expectDbError(pay((await newCharge('5000')).id, '-5000'), /signo de la deuda/);
  });

  it('refuses allocations to voided debts', async () => {
    const charge = await newCharge('1000');
    await db.admin.update(charges).set({ status: 'void', voidedAt: new Date(), voidReason: 'x' }).where(eq(charges.id, charge.id));
    await expectDbError(pay(charge.id, '1000'), /anulada/);
  });

  it('reversing a movement frees the debt and the movement stays immutable', async () => {
    const charge = await newCharge('80000');
    const movement = await pay(charge.id, '80000');
    expect(await statusOf(charge.id)).toBe('paid');

    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.update(movements).set({ amount: '1' }).where(eq(movements.id, movement.id))),
      /no se modifica/,
    );
    await db.withUser(alice.claims, (tx) =>
      tx.update(movements).set({ reversedAt: new Date(), reversedBy: alice.id, reverseReason: 'Cobro duplicado' }).where(eq(movements.id, movement.id)),
    );
    expect(await statusOf(charge.id)).toBe('pending');
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.update(movements).set({ notes: 'x' }).where(eq(movements.id, movement.id))),
      /ya está anulado/,
    );
  });

  it('numbers movements and never deletes them or their allocations', async () => {
    const list = await db.withUser(alice.claims, (tx) => tx.select().from(movements));
    expect(new Set(list.map((m) => m.number)).size).toBe(list.length);
    const deleted = await db.withUser(alice.claims, (tx) => tx.delete(movements).where(eq(movements.organizationId, orgA)).returning());
    expect(deleted).toEqual([]);
    const deletedAllocations = await db.withUser(alice.claims, (tx) => tx.delete(chargeAllocations).returning());
    expect(deletedAllocations).toEqual([]);
  });

  it('isolates movements between agencies', async () => {
    expect(await db.withUser(bob.claims, (tx) => tx.select().from(movements))).toEqual([]);
    await expectDbError(
      db.withUser(bob.claims, (tx) =>
        tx.insert(movements).values({ organizationId: orgB, type: 'tenant_payment', date: '2026-10-14', contractId, method: 'cash', amount: '1', currency: 'ARS', createdBy: bob.id }),
      ),
      /row-level security/,
    );
  });
});
