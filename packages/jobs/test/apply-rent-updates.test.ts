/**
 * applyRentUpdates against the local database, with a test index series so the
 * results don't depend on what INDEC publishes.
 */
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@rentavle/db';
import { createTestDb, type TestUser } from '../../db/test/helpers';
import { applyRentUpdates } from '../src/apply-rent-updates';

const { contracts, rentPeriods, indexSeries, indexValues, properties, organizations } = schema;
const { db, createUser, createOrganization, cleanup } = createTestDb();

let alice: TestUser;
let orgId: string;
let seriesId: string;
const seriesCode = `TEST_IPC_${randomUUID().slice(0, 8)}`;

/** Monthly levels: +2% a month from Nov-2025. */
const LEVELS: Record<string, string> = {
  '2025-11-01': '100.000000',
  '2025-12-01': '102.000000',
  '2026-01-01': '104.040000',
  '2026-02-01': '106.120800',
  '2026-03-01': '108.243216',
  '2026-04-01': '110.408080',
  '2026-05-01': '112.616242',
};

/** Creates a quarterly contract (on its own property) starting Jan-2026, billed from the start (100.000). */
async function quarterlyContract(updateMode: 'index' | 'fixed_pct' = 'index') {
  const year = 2026;
  const [property] = await db.admin
    .insert(properties)
    .values({ organizationId: orgId, street: `Calle ${randomUUID().slice(0, 4)}`, number: 0 })
    .returning();
  const [contract] = await db.admin
    .insert(contracts)
    .values({
      organizationId: orgId,
      number: 0,
      propertyId: property!.id,
      startDate: `${year}-01-01`,
      endDate: `${year + 1}-12-31`,
      originalEndDate: `${year + 1}-12-31`,
      currency: 'ARS',
      initialAmount: '100000',
      firstBilledMonth: `${year}-01-01`,
      updateMode,
      indexSeriesId: updateMode === 'index' ? seriesId : null,
      fixedUpdatePct: updateMode === 'fixed_pct' ? '5' : null,
      updateFrequencyMonths: 3,
    })
    .returning();
  const months = ['01', '04', '07', '10'];
  await db.admin.insert(rentPeriods).values(
    [...months.map((m) => `${year}-${m}-01`), ...months.map((m) => `${year + 1}-${m}-01`)].map((start, i) => ({
      organizationId: orgId,
      contractId: contract!.id,
      periodNumber: i + 1,
      startMonth: start,
      endMonth: start,
      status: i === 0 ? ('initial' as const) : ('pending' as const),
      amount: i === 0 ? '100000' : null,
    })),
  );
  return contract!;
}

function periodsOf(contractId: string) {
  return db.admin.select().from(rentPeriods).where(eq(rentPeriods.contractId, contractId)).orderBy(asc(rentPeriods.periodNumber));
}

beforeAll(async () => {
  alice = await createUser('alice');
  orgId = await createOrganization(alice, 'Inmobiliaria Índices');
  const [series] = await db.admin
    .insert(indexSeries)
    .values({ code: seriesCode, countryCode: 'AR', name: 'IPC de prueba', frequency: 'monthly', publisher: 'Test' })
    .returning();
  seriesId = series!.id;
  await db.admin.insert(indexValues).values(Object.entries(LEVELS).map(([date, value]) => ({ seriesId, date, value })));
});

afterAll(async () => {
  await db.admin.delete(contracts).where(eq(contracts.organizationId, orgId));
  await db.admin.delete(indexSeries).where(eq(indexSeries.id, seriesId));
  await cleanup();
});

describe('applyRentUpdates', () => {
  it('chains quarterly IPC updates with real values (two-month lag)', async () => {
    const contract = await quarterlyContract();
    const result = await applyRentUpdates(db.admin, { now: new Date('2026-07-10T12:00:00Z'), organizationId: orgId });
    expect(result).toMatchObject({ calculated: 2 });

    const periods = await periodsOf(contract.id);
    // Apr-2026: IPC Nov-25 → Feb-26 = ×1.061208 ; Jul-2026: Feb-26 → May-26 = ×1.061208
    expect(periods[1]).toMatchObject({
      status: 'calculated',
      previousAmount: '100000.00',
      amount: '106120.80',
      indexStartDate: '2025-11-01',
      indexEndDate: '2026-02-01',
      variationPct: '6.1208',
    });
    expect(periods[2]).toMatchObject({ status: 'calculated', previousAmount: '106120.80', amount: '112616.24' });
    // Oct-2026 isn't due yet (only this month and next are calculated).
    expect(periods[3]).toMatchObject({ status: 'pending', amount: null });
  });

  it('is idempotent', async () => {
    const before = await db.admin.select().from(rentPeriods).where(eq(rentPeriods.organizationId, orgId));
    await applyRentUpdates(db.admin, { now: new Date('2026-07-10T12:00:00Z'), organizationId: orgId });
    const after = await db.admin.select().from(rentPeriods).where(eq(rentPeriods.organizationId, orgId));
    expect(after.map((p) => [p.id, p.amount, p.status])).toEqual(before.map((p) => [p.id, p.amount, p.status]));
  });

  it('marks periods waiting for an unpublished index and calculates them later', async () => {
    // Oct-2026 needs Aug-2026, not published in the fixture.
    const result = await applyRentUpdates(db.admin, { now: new Date('2026-10-02T12:00:00Z'), organizationId: orgId });
    expect(result.waitingForIndex).toBeGreaterThan(0);
    const [contract] = await db.admin.select().from(contracts).where(eq(contracts.organizationId, orgId));
    const periods = await periodsOf(contract!.id);
    expect(periods[3]).toMatchObject({ status: 'pending_index', amount: null });

    await db.admin.insert(indexValues).values([
      { seriesId, date: '2026-06-01', value: '114.868567' },
      { seriesId, date: '2026-07-01', value: '117.165938' },
      { seriesId, date: '2026-08-01', value: '119.509257' },
    ]);
    await applyRentUpdates(db.admin, { now: new Date('2026-10-02T12:00:00Z'), organizationId: orgId });
    const updated = await periodsOf(contract!.id);
    expect(updated[3]).toMatchObject({ status: 'calculated', previousAmount: '112616.24', amount: '119509.25' }); // 112616.24 × 1.0612080005… = 119509.2549
  });

  it('uses the previous month as provisional when the organization prefers it', async () => {
    await db.admin.update(organizations).set({ settings: { ipcMode: 'provisional' } }).where(eq(organizations.id, orgId));
    const contract = await quarterlyContract();
    await applyRentUpdates(db.admin, { now: new Date('2026-04-03T12:00:00Z'), organizationId: orgId });
    const periods = await periodsOf(contract.id);
    // Apr-2026 in provisional mode uses Dec-25 → Mar-26 (all published) → calculated.
    expect(periods[1]).toMatchObject({ status: 'calculated', indexStartDate: '2025-12-01', indexEndDate: '2026-03-01' });
    await db.admin.update(organizations).set({ settings: {} }).where(eq(organizations.id, orgId));
  });

  it('applies fixed percentages', async () => {
    const contract = await quarterlyContract('fixed_pct');
    await applyRentUpdates(db.admin, { now: new Date('2026-04-03T12:00:00Z'), organizationId: orgId });
    const periods = await periodsOf(contract.id);
    expect(periods[1]).toMatchObject({ status: 'calculated', amount: '105000.00', variationPct: '5.0000' });
  });

  it('never touches periods adjusted by hand', async () => {
    const contract = await quarterlyContract();
    const [p2] = (await periodsOf(contract.id)).slice(1);
    await db.admin.update(rentPeriods).set({ status: 'manually_adjusted', amount: '123456.00' }).where(eq(rentPeriods.id, p2!.id));
    await applyRentUpdates(db.admin, { now: new Date('2026-07-10T12:00:00Z'), organizationId: orgId });
    const periods = await periodsOf(contract.id);
    expect(periods[1]).toMatchObject({ status: 'manually_adjusted', amount: '123456.00' });
    // The next period builds on the adjusted amount.
    expect(periods[2]).toMatchObject({ status: 'calculated', previousAmount: '123456.00' });
  });
});
