/**
 * Contracts: isolation, numbering, overlap guard, append-only history and
 * read-only index series.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '../src/client';
import {
  clients,
  contractEvents,
  contractParties,
  contracts,
  indexSeries,
  properties,
  rentPeriods,
} from '../src/schema';
import { createTestDb, expectDbError, type TestUser } from './helpers';

const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
let bob: TestUser;
let orgA: string;
let orgB: string;
let propertyA: string;
let tenantA: string;
let ipcId: string;

async function insertContract(
  tx: Transaction,
  values: Partial<typeof contracts.$inferInsert> & { organizationId: string; propertyId: string },
) {
  const [row] = await tx
    .insert(contracts)
    .values({
      startDate: '2026-04-01',
      endDate: '2029-03-31',
      originalEndDate: '2029-03-31',
      currency: 'ARS',
      initialAmount: '500000',
      firstBilledMonth: '2026-10-01',
      updateMode: 'index',
      indexSeriesId: ipcId,
      updateFrequencyMonths: 6,
      ...values,
    })
    .returning();
  return row!;
}

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
  orgA = await createOrganization(alice, 'Inmobiliaria A');
  orgB = await createOrganization(bob, 'Inmobiliaria B');
  const [ipc] = await db.admin.select().from(indexSeries).where(eq(indexSeries.code, 'AR_IPC'));
  ipcId = ipc!.id;

  await db.withUser(alice.claims, async (tx) => {
    const [p] = await tx.insert(properties).values({ organizationId: orgA, street: 'Ficticia', streetNumber: '100' }).returning();
    const [c] = await tx
      .insert(clients)
      .values({ organizationId: orgA, kind: 'person', firstName: 'Ana', lastName: 'Inquilina' })
      .returning();
    propertyA = p!.id;
    tenantA = c!.id;
  });
});

afterAll(cleanup);

describe('contracts', () => {
  it('numbers contracts per organization and stores the schedule', async () => {
    const contract = await db.withUser(alice.claims, async (tx) => {
      const created = await insertContract(tx, { organizationId: orgA, propertyId: propertyA });
      await tx.insert(contractParties).values({ organizationId: orgA, contractId: created.id, clientId: tenantA, role: 'tenant' });
      await tx.insert(rentPeriods).values([
        { organizationId: orgA, contractId: created.id, periodNumber: 1, startMonth: '2026-04-01', endMonth: '2026-09-01', status: 'not_billed' },
        { organizationId: orgA, contractId: created.id, periodNumber: 2, startMonth: '2026-10-01', endMonth: '2027-03-01', status: 'initial', amount: '500000' },
      ]);
      await tx.insert(contractEvents).values({ organizationId: orgA, contractId: created.id, type: 'created', createdBy: alice.id });
      return created;
    });
    expect(contract.number).toBe(1);
  });

  it('rejects a second active contract overlapping on the same property', async () => {
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        insertContract(tx, { organizationId: orgA, propertyId: propertyA, startDate: '2028-01-01', endDate: '2030-12-31', originalEndDate: '2030-12-31', firstBilledMonth: '2028-01-01' }),
      ),
      /contracts_no_overlap/,
    );
  });

  it('allows a new contract once the previous one ends', async () => {
    const next = await db.withUser(alice.claims, (tx) =>
      insertContract(tx, {
        organizationId: orgA,
        propertyId: propertyA,
        startDate: '2029-04-01',
        endDate: '2032-03-31',
        originalEndDate: '2032-03-31',
        firstBilledMonth: '2029-04-01',
      }),
    );
    expect(next.number).toBe(2);
  });

  it('validates the update configuration and the first billed month', async () => {
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        insertContract(tx, { organizationId: orgA, propertyId: propertyA, startDate: '2035-01-01', endDate: '2036-01-01', originalEndDate: '2036-01-01', firstBilledMonth: '2035-01-01', indexSeriesId: null }),
      ),
      /contracts_update_config/,
    );
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        insertContract(tx, { organizationId: orgA, propertyId: propertyA, startDate: '2035-01-01', endDate: '2036-01-01', originalEndDate: '2036-01-01', firstBilledMonth: '2034-12-01' }),
      ),
      /contracts_first_billed_month/,
    );
  });

  it('does not let another organization see or use the contract or property', async () => {
    const seen = await db.withUser(bob.claims, (tx) => tx.select().from(contracts));
    expect(seen).toEqual([]);

    await expectDbError(
      db.withUser(bob.claims, (tx) =>
        insertContract(tx, { organizationId: orgB, propertyId: propertyA, startDate: '2040-01-01', endDate: '2041-01-01', originalEndDate: '2041-01-01', firstBilledMonth: '2040-01-01' }),
      ),
      /row-level security/,
    );
  });

  it('keeps the history append-only', async () => {
    const [contract] = await db.withUser(alice.claims, (tx) => tx.select().from(contracts).where(eq(contracts.number, 1)));
    const updated = await db.withUser(alice.claims, (tx) =>
      tx.update(contractEvents).set({ reason: 'cambiado' }).where(eq(contractEvents.contractId, contract!.id)).returning(),
    );
    expect(updated).toEqual([]);
    const deleted = await db.withUser(alice.claims, (tx) =>
      tx.delete(contractEvents).where(eq(contractEvents.contractId, contract!.id)).returning(),
    );
    expect(deleted).toEqual([]);
  });

  it('requires amounts exactly on periods that have them', async () => {
    const [contract] = await db.withUser(alice.claims, (tx) => tx.select().from(contracts).where(eq(contracts.number, 1)));
    await expectDbError(
      db.withUser(alice.claims, (tx) =>
        tx.insert(rentPeriods).values({ organizationId: orgA, contractId: contract!.id, periodNumber: 3, startMonth: '2027-04-01', endMonth: '2027-09-01', status: 'pending', amount: '1' }),
      ),
      /rent_periods_amount_by_status/,
    );
  });
});

describe('index series', () => {
  it('are readable by users but not writable', async () => {
    const series = await db.withUser(alice.claims, (tx) => tx.select().from(indexSeries));
    expect(series.map((s) => s.code).sort()).toEqual(['AR_CASA_PROPIA', 'AR_ICL', 'AR_IPC']);

    await expectDbError(
      db.withUser(alice.claims, (tx) => tx.execute(sql`insert into public.index_values (series_id, date, value) values (${ipcId}, '2026-01-01', 1)`)),
      /row-level security/,
    );
  });
});
