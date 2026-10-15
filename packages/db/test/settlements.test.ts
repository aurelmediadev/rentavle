/** Owner settlements: no double settlement, and settled payments can't be annulled. */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargeAllocations, charges, clients, contracts, movements, properties, settlementLines } from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
let orgA: string;
let contractId: string;
let ownerId: string;

async function paidCharge(creditor: 'owner' | 'administration' = 'owner') {
  return db.withUser(alice.claims, async (tx) => {
    const [charge] = await tx
      .insert(charges)
      .values({
        organizationId: orgA,
        contractId,
        type: 'one_off',
        periodMonth: '2026-10-01',
        title: 'Alquiler',
        amount: '100000',
        currency: 'ARS',
        debtor: 'tenant',
        creditor,
        dueDate: '2026-10-10',
      })
      .returning();
    const [payment] = await tx
      .insert(movements)
      .values({ organizationId: orgA, type: 'tenant_payment', date: '2026-10-12', contractId, method: 'cash', amount: '100000', currency: 'ARS', createdBy: alice.id })
      .returning();
    const [allocation] = await tx
      .insert(chargeAllocations)
      .values({ organizationId: orgA, movementId: payment!.id, chargeId: charge!.id, amount: '100000' })
      .returning();
    return { payment: payment!, allocation: allocation! };
  });
}

async function settle(allocationId: string) {
  return db.withUser(alice.claims, async (tx) => {
    const [settlement] = await tx
      .insert(movements)
      .values({ organizationId: orgA, type: 'owner_settlement', date: '2026-10-15', contractId, clientId: ownerId, method: 'transfer_from_admin', amount: '90000', currency: 'ARS', createdBy: alice.id })
      .returning();
    await tx.insert(settlementLines).values({
      organizationId: orgA,
      settlementId: settlement!.id,
      allocationId,
      clientId: ownerId,
      sharePct: '100',
      gross: '100000',
      fee: '10000',
      payout: '90000',
    });
    return settlement!;
  });
}

const reverse = (id: string) =>
  db.withUser(alice.claims, (tx) =>
    tx.update(movements).set({ reversedAt: new Date(), reversedBy: alice.id, reverseReason: 'prueba' }).where(eq(movements.id, id)),
  );

beforeAll(async () => {
  alice = await createUser('alice');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  const [property] = await db.admin.insert(properties).values({ organizationId: orgA, street: 'Ficticia' }).returning();
  const [owner] = await db.admin.insert(clients).values({ organizationId: orgA, kind: 'person', firstName: 'Pedro', lastName: 'Dueño' }).returning();
  ownerId = owner!.id;
  const [contract] = await db.admin
    .insert(contracts)
    .values({ organizationId: orgA, propertyId: property!.id, startDate: '2026-01-01', endDate: '2027-12-31', originalEndDate: '2027-12-31', currency: 'ARS', initialAmount: '100000', firstBilledMonth: '2026-01-01' })
    .returning();
  contractId = contract!.id;
});

afterAll(async () => {
  await db.admin.delete(movements).where(eq(movements.organizationId, orgA));
  await db.admin.delete(charges).where(eq(charges.organizationId, orgA));
  await db.admin.delete(contracts).where(eq(contracts.organizationId, orgA));
  await cleanup();
});

describe('settlement lines', () => {
  it('settles a payment once per owner', async () => {
    const { allocation } = await paidCharge();
    await settle(allocation.id);
    await expectDbError(settle(allocation.id), /ya fue liquidado/);
  });

  it('only settles debts in favour of the owner', async () => {
    const { allocation } = await paidCharge('administration');
    await expectDbError(settle(allocation.id), /no es a favor del propietario/);
  });

  it('blocks annulling a settled payment until the settlement is annulled', async () => {
    const { payment, allocation } = await paidCharge();
    const settlement = await settle(allocation.id);
    await expectDbError(reverse(payment.id), /anulá primero la liquidación #\d+/);

    await reverse(settlement.id);
    await reverse(payment.id);
    const [after] = await db.admin.select().from(movements).where(eq(movements.id, payment.id));
    expect(after?.reversedAt).not.toBeNull();
  });

  it('frees the payment for a new settlement after annulling the previous one', async () => {
    const { allocation } = await paidCharge();
    const first = await settle(allocation.id);
    await reverse(first.id);
    await expect(settle(allocation.id)).resolves.toBeTruthy();
  });

  it('refuses to settle annulled payments', async () => {
    const { payment, allocation } = await paidCharge();
    await reverse(payment.id);
    await expectDbError(settle(allocation.id), /Solo se liquidan cobros vigentes/);
  });
});
