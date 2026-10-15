/**
 * Sample agency data (Argentina): owners, tenants, a co-owned house, contracts
 * updated by IPC, ICL and a fixed percentage, expensas, and this month's debts.
 * Used by the local demo (seed-demo) and by the in-app sample agency (onboarding).
 * Other countries will need their own set (index series, documents).
 *
 * Server code only: writes with the given connection, bypassing RLS, into an
 * organization that was just created for this purpose.
 */
import { eq } from 'drizzle-orm';
import { type Database, schema } from '@rentavle/db';
import { addMonths, formatYearMonth, planPeriods, type YearMonth } from '@rentavle/domain';
import { applyRentUpdates } from './apply-rent-updates';
import { generateCharges } from './generate-charges';

const { clients, clientContacts, properties, propertyOwners, contracts, contractParties, rentPeriods, contractEvents, recurringCharges } = schema;

function monthStart(base: YearMonth, offset: number) {
  return `${formatYearMonth(addMonths(base, offset))}-01`;
}

export async function loadSampleData(db: Database, organizationId: string, userId: string, now: Date) {
  const current: YearMonth = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

  // 3. Clients.
  const person = (firstName: string, lastName: string, docNumber: string, email: string, phone: string) => ({
    organizationId,
    kind: 'person' as const,
    firstName,
    lastName,
    docType: 'DNI',
    docNumber,
    city: 'CABA',
    region: 'CABA',
    createdBy: userId,
    contact: { email, phone },
  });
  const people = [
    person('Pedro', 'Gómez', '20111222', 'pedro.gomez@example.com', '+54 11 4000-1111'),
    person('Ana', 'Torres', '33444555', 'ana.torres@example.com', '+54 11 4000-2222'),
    person('Carlos', 'Fernández', '25666777', 'carlos.f@example.com', '+54 11 4000-3333'),
    person('Marcos', 'Díaz', '30888999', 'marcos.diaz@example.com', '+54 11 4000-4444'),
    person('Laura', 'Pérez', '28123123', 'laura.perez@example.com', '+54 11 4000-5555'),
    person('Jorge', 'Pérez', '27456456', 'jorge.perez@example.com', '+54 11 4000-6666'),
    person('Sofía', 'Ruiz', '38999000', 'sofia.ruiz@example.com', '+54 11 4000-7777'),
  ];
  const inserted = await db
    .insert(clients)
    .values(people.map(({ contact: _contact, ...c }) => c))
    .returning({ id: clients.id, firstName: clients.firstName });
  const company = await db
    .insert(clients)
    .values({ organizationId: organizationId, kind: 'company', companyName: 'Inversiones del Sur SA', taxId: '30712345671', createdBy: userId })
    .returning({ id: clients.id });
  const id = (name: string) => inserted.find((c) => c.firstName === name)!.id;
  await db.insert(clientContacts).values(
    people.flatMap((p, i) => [
      { organizationId: organizationId, clientId: inserted[i]!.id, type: 'email' as const, value: p.contact.email, isPrimary: true },
      { organizationId: organizationId, clientId: inserted[i]!.id, type: 'phone' as const, value: p.contact.phone, isPrimary: true },
    ]),
  );

  // 4. Properties.
  const property = async (street: string, streetNumber: string, unit: string | null, type: 'apartment' | 'house' | 'commercial', owners: [string, string][]) => {
    const [p] = await db
      .insert(properties)
      .values({ organizationId: organizationId, street, streetNumber, unit, city: 'CABA', region: 'CABA', type, createdBy: userId })
      .returning({ id: properties.id });
    await db.insert(propertyOwners).values(owners.map(([clientId, pct]) => ({ organizationId: organizationId, propertyId: p!.id, clientId, ownershipPct: pct })));
    return { id: p!.id, owners };
  };
  const palermo = await property('Gurruchaga', '1456', '3° B', 'apartment', [[id('Pedro'), '100']]);
  const local = await property('Av. Corrientes', '2380', 'PB', 'commercial', [[company[0]!.id, '100']]);
  const casa = await property('Juan B. Justo', '4356', null, 'house', [[id('Laura'), '50'], [id('Jorge'), '50']]);
  await property('Paraguay', '3270', '2° C', 'apartment', [[id('Pedro'), '100']]);

  const [ipc] = await db.select().from(schema.indexSeries).where(eq(schema.indexSeries.code, 'AR_IPC'));
  const [icl] = await db.select().from(schema.indexSeries).where(eq(schema.indexSeries.code, 'AR_ICL'));

  // 5. Contracts.
  const contract = async (opts: {
    propertyId: string;
    owners: [string, string][];
    tenantId: string;
    guarantorId?: string;
    startDate: string;
    endDate: string;
    firstBilledMonth: string;
    amount: string;
    update: { mode: 'index'; seriesId: string; months: number } | { mode: 'fixed_pct'; pct: string; months: number };
  }) => {
    const [c] = await db
      .insert(contracts)
      .values({
        organizationId,
        propertyId: opts.propertyId,
        startDate: opts.startDate,
        endDate: opts.endDate,
        originalEndDate: opts.endDate,
        currency: 'ARS',
        initialAmount: opts.amount,
        firstBilledMonth: opts.firstBilledMonth,
        updateMode: opts.update.mode,
        indexSeriesId: opts.update.mode === 'index' ? opts.update.seriesId : null,
        fixedUpdatePct: opts.update.mode === 'fixed_pct' ? opts.update.pct : null,
        updateFrequencyMonths: opts.update.months,
        feeType: 'pct',
        feeValue: '10',
        lateInterestDailyPct: '0.5',
        dueDay: 10,
        createdBy: userId,
      })
      .returning();
    await db.insert(contractParties).values([
      ...opts.owners.map(([clientId, pct]) => ({ organizationId: organizationId, contractId: c!.id, clientId, role: 'owner' as const, sharePct: pct })),
      { organizationId: organizationId, contractId: c!.id, clientId: opts.tenantId, role: 'tenant' as const },
      ...(opts.guarantorId ? [{ organizationId: organizationId, contractId: c!.id, clientId: opts.guarantorId, role: 'guarantor' as const }] : []),
    ]);
    const plan = planPeriods(
      { startDate: opts.startDate, endDate: opts.endDate },
      opts.update.months,
      { year: Number(opts.firstBilledMonth.slice(0, 4)), month: Number(opts.firstBilledMonth.slice(5, 7)) },
    );
    await db.insert(rentPeriods).values(
      plan.map((p) => ({
        organizationId,
        contractId: c!.id,
        periodNumber: p.number,
        startMonth: `${formatYearMonth(p.startMonth)}-01`,
        endMonth: `${formatYearMonth(p.endMonth)}-01`,
        status: p.status,
        amount: p.status === 'initial' ? opts.amount : null,
      })),
    );
    await db.insert(contractEvents).values({ organizationId: organizationId, contractId: c!.id, type: 'created', createdBy: userId });
    await db.update(properties).set({ status: 'rented' }).where(eq(properties.id, opts.propertyId));
    return c!;
  };

  // Quarterly IPC, started three months ago and billed from the start: updated this month.
  const c1 = await contract({
    propertyId: palermo.id,
    owners: palermo.owners,
    tenantId: id('Ana'),
    guarantorId: id('Carlos'),
    startDate: monthStart(current, -3),
    endDate: `${formatYearMonth(addMonths(current, 20))}-${new Date(Date.UTC(addMonths(current, 21).year, addMonths(current, 21).month - 1, 0)).getUTCDate()}`,
    firstBilledMonth: monthStart(current, -3),
    amount: '450000',
    update: { mode: 'index', seriesId: ipc!.id, months: 3 },
  });
  await db.insert(recurringCharges).values({
    organizationId,
    contractId: c1.id,
    title: 'Expensas',
    currency: 'ARS',
    startMonth: monthStart(current, -1),
    lastAmount: '85000',
    requiresConfirmation: true,
    createdBy: userId,
  });

  // Semiannual ICL, loaded in progress (earlier installments considered paid).
  const startLocal = `${formatYearMonth(addMonths(current, -6))}-15`;
  await contract({
    propertyId: local.id,
    owners: local.owners,
    tenantId: id('Marcos'),
    startDate: startLocal,
    endDate: `${formatYearMonth(addMonths(current, 30))}-14`,
    firstBilledMonth: monthStart(current, 0),
    amount: '1200000',
    update: { mode: 'index', seriesId: icl!.id, months: 6 },
  });

  // Fixed 8% every four months, starting next month (no debts yet).
  await contract({
    propertyId: casa.id,
    owners: casa.owners,
    tenantId: id('Sofía'),
    startDate: monthStart(current, 1),
    endDate: `${formatYearMonth(addMonths(current, 24))}-${new Date(Date.UTC(addMonths(current, 25).year, addMonths(current, 25).month - 1, 0)).getUTCDate()}`,
    firstBilledMonth: monthStart(current, 1),
    amount: '700000',
    update: { mode: 'fixed_pct', pct: '8', months: 4 },
  });

  // 6. Same jobs the daily cron runs.
  const updates = await applyRentUpdates(db, { now, organizationId });
  const charges = await generateCharges(db, { now, organizationId });
  return { updates, charges };
}
