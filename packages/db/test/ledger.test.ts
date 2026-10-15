/**
 * Double-entry ledger: every debt and movement posts balanced entries at commit,
 * corrections are reversals, and entries can't be changed. Reproduces the example
 * of docs/03-reglas-de-negocio.md §9.
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cashAccounts,
  chargeAllocations,
  charges,
  clients,
  contractParties,
  contracts,
  ledgerEntries,
  movements,
  properties,
  settlementLines,
} from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, purgeLedger, cleanup } = createTestDb();

let alice: TestUser;
const orgs: string[] = [];

interface Agency {
  orgId: string;
  contractId: string;
  ownerId: string;
  cashId: string;
}

async function agency(): Promise<Agency> {
  const orgId = await createOrganization(alice, `Inmobiliaria ${orgs.length + 1}`);
  orgs.push(orgId);
  const [property] = await db.admin.insert(properties).values({ organizationId: orgId, street: 'Ficticia' }).returning();
  const [owner] = await db.admin.insert(clients).values({ organizationId: orgId, kind: 'person', firstName: 'Pedro', lastName: 'Dueño' }).returning();
  const [contract] = await db.admin
    .insert(contracts)
    .values({ organizationId: orgId, propertyId: property!.id, startDate: '2026-01-01', endDate: '2027-12-31', originalEndDate: '2027-12-31', currency: 'ARS', initialAmount: '500000', firstBilledMonth: '2026-01-01', feeType: 'pct', feeValue: '10' })
    .returning();
  await db.admin.insert(contractParties).values({ organizationId: orgId, contractId: contract!.id, clientId: owner!.id, role: 'owner', sharePct: '100' });
  const [cash] = await db.admin.select().from(cashAccounts).where(and(eq(cashAccounts.organizationId, orgId), eq(cashAccounts.isDefault, true)));
  return { orgId, contractId: contract!.id, ownerId: owner!.id, cashId: cash!.id };
}

function charge(a: Agency, over: Partial<typeof charges.$inferInsert>) {
  return db.withUser(alice.claims, async (tx) => {
    const [row] = await tx
      .insert(charges)
      .values({
        organizationId: a.orgId,
        contractId: a.contractId,
        type: 'one_off',
        periodMonth: '2026-10-01',
        title: 'Alquiler',
        amount: '500000',
        currency: 'ARS',
        debtor: 'tenant',
        creditor: 'owner',
        dueDate: '2026-10-10',
        ...over,
      })
      .returning();
    return row!;
  });
}

function movement(a: Agency, over: Partial<typeof movements.$inferInsert>, allocations: { chargeId: string; amount: string }[] = []) {
  return db.withUser(alice.claims, async (tx) => {
    const [row] = await tx
      .insert(movements)
      .values({ organizationId: a.orgId, type: 'tenant_payment', date: '2026-10-14', contractId: a.contractId, method: 'cash', cashAccountId: a.cashId, amount: '0', currency: 'ARS', createdBy: alice.id, ...over })
      .returning();
    if (allocations.length) {
      await tx.insert(chargeAllocations).values(allocations.map((x) => ({ organizationId: a.orgId, movementId: row!.id, ...x })));
    }
    return row!;
  });
}

const reverse = (id: string) =>
  db.withUser(alice.claims, (tx) =>
    tx.update(movements).set({ reversedAt: new Date(), reversedBy: alice.id, reverseReason: 'prueba' }).where(eq(movements.id, id)),
  );

/** Balance per account type (debit positive), as the user sees it through RLS. */
async function balances(a: Agency) {
  const rows = await db.withUser(alice.claims, (tx) =>
    tx.execute<{ type: string; balance: string }>(sql`
      select la.type, sum(case e.direction when 'debit' then e.amount else -e.amount end)::text as balance
      from public.ledger_entries e join public.ledger_accounts la on la.id = e.account_id
      where e.organization_id = ${a.orgId}
      group by la.type
    `),
  );
  return Object.fromEntries(rows.map((r) => [r.type, r.balance]));
}

beforeAll(async () => {
  alice = await createUser('alice');
});

afterAll(async () => {
  for (const orgId of orgs) {
    await purgeLedger(orgId);
    await db.admin.delete(movements).where(eq(movements.organizationId, orgId));
    await db.admin.delete(charges).where(eq(charges.organizationId, orgId));
    await db.admin.delete(contracts).where(eq(contracts.organizationId, orgId));
  }
  await cleanup();
});

describe('ledger', () => {
  it('reproduces the cash example: collection in cash, then settlement in cash', async () => {
    const a = await agency();
    const rent = await charge(a, { type: 'rent', title: 'Alquiler', appliesFee: true });
    const expensas = await charge(a, { type: 'recurring', title: 'Expensas', amount: '80000', creditor: 'administration' });
    const interest = await charge(a, { type: 'late_interest', title: 'Punitorios', amount: '35000', appliesFee: true });
    const payment = await movement(a, { amount: '615000' }, [
      { chargeId: rent.id, amount: '500000' },
      { chargeId: expensas.id, amount: '80000' },
      { chargeId: interest.id, amount: '35000' },
    ]);
    expect(await balances(a)).toMatchObject({ cash: '615000.00', tenant: '0.00', owner: '-535000.00', admin_charges: '-80000.00' });

    const allocations = await db.admin.select().from(chargeAllocations).where(eq(chargeAllocations.movementId, payment.id));
    await db.withUser(alice.claims, async (tx) => {
      const [settlement] = await tx
        .insert(movements)
        .values({ organizationId: a.orgId, type: 'owner_settlement', date: '2026-10-15', contractId: a.contractId, clientId: a.ownerId, method: 'cash', cashAccountId: a.cashId, amount: '481500', currency: 'ARS', createdBy: alice.id })
        .returning();
      const owed = [
        { chargeId: rent.id, gross: '500000', fee: '50000', payout: '450000' },
        { chargeId: interest.id, gross: '35000', fee: '3500', payout: '31500' },
      ];
      await tx.insert(settlementLines).values(
        owed.map((o) => ({
          organizationId: a.orgId,
          settlementId: settlement!.id,
          allocationId: allocations.find((x) => x.chargeId === o.chargeId)!.id,
          clientId: a.ownerId,
          sharePct: '100',
          gross: o.gross,
          fee: o.fee,
          payout: o.payout,
        })),
      );
    });

    // Cash 615.000 − 481.500 = 133.500 = fees 53.500 + expensas 80.000.
    expect(await balances(a)).toMatchObject({
      cash: '133500.00',
      tenant: '0.00',
      owner: '0.00',
      fees: '-53500.00',
      admin_charges: '-80000.00',
    });
  });

  it('reverses entries when a payment is annulled, keeping the originals', async () => {
    const a = await agency();
    const rent = await charge(a, { type: 'rent' });
    const payment = await movement(a, { amount: '500000' }, [{ chargeId: rent.id, amount: '500000' }]);
    await reverse(payment.id);

    expect(await balances(a)).toMatchObject({ cash: '0.00', tenant: '500000.00', owner: '-500000.00' });
    const entries = await db.admin.select().from(ledgerEntries).where(eq(ledgerEntries.movementId, payment.id));
    expect(entries).toHaveLength(4);
    expect(entries.filter((e) => e.reversalOfId)).toHaveLength(2);
    expect(entries.find((e) => e.reversalOfId)?.concept).toMatch(/^Anulación: Cobro #\d+/);
  });

  it('re-posts a debt when its amount changes and reverses it when voided', async () => {
    const a = await agency();
    const debt = await charge(a, { type: 'recurring', title: 'Expensas', amount: '80000', creditor: 'administration' });
    await db.withUser(alice.claims, (tx) => tx.update(charges).set({ amount: '85000' }).where(eq(charges.id, debt.id)));
    expect(await balances(a)).toMatchObject({ tenant: '85000.00', admin_charges: '-85000.00' });

    await db.withUser(alice.claims, (tx) =>
      tx.update(charges).set({ status: 'void', voidedAt: new Date(), voidReason: 'prueba' }).where(eq(charges.id, debt.id)),
    );
    expect(await balances(a)).toMatchObject({ tenant: '0.00', admin_charges: '0.00' });
    const entries = await db.admin.select().from(ledgerEntries).where(eq(ledgerEntries.chargeId, debt.id));
    expect(entries).toHaveLength(8); // posted, reversed, re-posted, reversed: two entries each
  });

  it('posts discounts the other way and saldo a favor not at all', async () => {
    const a = await agency();
    await charge(a, { title: 'Bonificación', amount: '-20000' });
    await charge(a, { type: 'credit_balance', title: 'Saldo a favor', amount: '-5000' });
    expect(await balances(a)).toMatchObject({ tenant: '-20000.00', owner: '20000.00' });
  });

  it('credits the tenant for an overpayment through the payment itself', async () => {
    const a = await agency();
    const rent = await charge(a, { type: 'rent' });
    await movement(a, { amount: '510000' }, [{ chargeId: rent.id, amount: '500000' }]);
    expect(await balances(a)).toMatchObject({ cash: '510000.00', tenant: '-10000.00' });
  });

  it('posts payments made straight to the owner, whole or split', async () => {
    const a = await agency();
    const rent = await charge(a, { type: 'rent', appliesFee: true });
    await movement(a, { method: 'transfer_to_owner', cashAccountId: null, amount: '500000' }, [{ chargeId: rent.id, amount: '500000' }]);
    expect(await balances(a)).toMatchObject({ tenant: '0.00', owner: '0.00' });
    expect((await balances(a)).cash ?? '0.00').toBe('0.00');

    const b = await agency();
    const rent2 = await charge(b, { type: 'rent', appliesFee: true });
    await movement(b, { method: 'split_transfer', ownerDirectAmount: '450000', amount: '500000' }, [{ chargeId: rent2.id, amount: '500000' }]);
    expect(await balances(b)).toMatchObject({ cash: '50000.00', tenant: '0.00', owner: '-50000.00' });
  });

  it('posts manual income, expenses and transfers between boxes', async () => {
    const a = await agency();
    const [bank] = await db.withUser(alice.claims, (tx) =>
      tx.insert(cashAccounts).values({ organizationId: a.orgId, type: 'bank', name: 'Banco', currency: 'ARS' }).returning(),
    );
    await movement(a, { type: 'manual_income', contractId: null, amount: '10000', notes: 'Venta de llaves' });
    await movement(a, { type: 'manual_expense', contractId: null, amount: '3000', notes: 'Librería' });
    await movement(a, { type: 'transfer', contractId: null, amount: '5000', toCashAccountId: bank!.id });
    expect(await balances(a)).toMatchObject({ cash: '7000.00', other_income: '-10000.00', expenses: '3000.00' });

    const perBox = await db.admin.execute<{ ref_id: string; balance: string }>(sql`
      select la.ref_id, sum(case e.direction when 'debit' then e.amount else -e.amount end)::text as balance
      from public.ledger_entries e join public.ledger_accounts la on la.id = e.account_id
      where e.organization_id = ${a.orgId} and la.type = 'cash' group by la.ref_id
    `);
    expect(Object.fromEntries(perBox.map((r) => [r.ref_id, r.balance]))).toEqual({ [a.cashId]: '2000.00', [bank!.id]: '5000.00' });

    await expectDbError(movement(a, { type: 'transfer', contractId: null, amount: '1', toCashAccountId: a.cashId }), /movements_transfer/);
  });

  it('never lets entries be changed, deleted or written by users', async () => {
    const a = await agency();
    await charge(a, { type: 'rent' });
    const [entry] = await db.admin.select().from(ledgerEntries).where(eq(ledgerEntries.organizationId, a.orgId));
    await expectDbError(db.admin.update(ledgerEntries).set({ amount: '1' }).where(eq(ledgerEntries.id, entry!.id)), /no se modifican/);
    await expectDbError(db.admin.delete(ledgerEntries).where(eq(ledgerEntries.id, entry!.id)), /no se modifican/);
    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.insert(ledgerEntries).values({ ...entry!, id: undefined, reversalOfId: null })),
      /permission denied/,
    );
  });

  it('refuses unbalanced postings', async () => {
    const a = await agency();
    await charge(a, { type: 'rent' });
    const [entry] = await db.admin.select().from(ledgerEntries).where(eq(ledgerEntries.organizationId, a.orgId));
    await expectDbError(
      db.admin.insert(ledgerEntries).values({ ...entry!, id: undefined, postingId: crypto.randomUUID() }),
      /desbalanceado/,
    );
  });
});
