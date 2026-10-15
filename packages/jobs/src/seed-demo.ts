/**
 * Creates (or recreates) a demo agency with sample data in the LOCAL database, to
 * explore the app: `pnpm --filter @rentavle/jobs seed-demo`.
 *
 * Refuses to run against anything other than localhost. The demo account below
 * only exists in the local Supabase stack.
 */
import { eq, sql } from 'drizzle-orm';
import { createDbClients, schema } from '@rentavle/db';
import { addMonths, formatYearMonth, planPeriods, type YearMonth } from '@rentavle/domain';
import { applyRentUpdates } from './apply-rent-updates';
import { generateCharges } from './generate-charges';

import { DEMO_EMAIL, DEMO_PASSWORD } from './seed-demo-credentials';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DATABASE_URL) || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(SUPABASE_URL)) {
  throw new Error('seed-demo only runs against the local Supabase stack');
}
if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY (see `pnpm exec supabase status`)');

const { clients, clientContacts, properties, propertyOwners, contracts, contractParties, rentPeriods, contractEvents, recurringCharges, organizations } =
  schema;
const db = createDbClients(DATABASE_URL);

async function authAdmin(path: string, init: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY!, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
  });
  if (!response.ok) throw new Error(`auth admin ${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<{ id: string }>;
}

function monthStart(base: YearMonth, offset: number) {
  return `${formatYearMonth(addMonths(base, offset))}-01`;
}

try {
  const now = new Date();
  const current: YearMonth = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

  // 1. Start clean: remove a previous demo user and its agency.
  const [existing] = await db.admin.execute<{ id: string }>(sql`select id from auth.users where email = ${DEMO_EMAIL}`);
  if (existing) {
    await db.admin.delete(organizations).where(eq(organizations.createdBy, existing.id));
    await authAdmin(`/users/${existing.id}`, { method: 'DELETE' });
  }

  // 2. Confirmed demo user.
  const user = await authAdmin('/users', {
    method: 'POST',
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'Demo', last_name: 'Rentavle' },
    }),
  });
  const claims = { sub: user.id, role: 'authenticated', email: DEMO_EMAIL };
  const orgId = await db.withUser(claims, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select public.create_organization('Inmobiliaria Demo', 'AR', 'ARS', 'America/Argentina/Buenos_Aires', 'es-AR', '30712345671') as id
    `);
    return rows[0]!.id;
  });
  // Local demo user doubles as Rentavle staff, to try the internal panel (/admin).
  await db.admin.insert(schema.platformAdmins).values({ userId: user.id }).onConflictDoNothing();

  // 3. Clients.
  const person = (firstName: string, lastName: string, docNumber: string, email: string, phone: string) => ({
    organizationId: orgId,
    kind: 'person' as const,
    firstName,
    lastName,
    docType: 'DNI',
    docNumber,
    city: 'CABA',
    region: 'CABA',
    createdBy: user.id,
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
  const inserted = await db.admin
    .insert(clients)
    .values(people.map(({ contact: _contact, ...c }) => c))
    .returning({ id: clients.id, firstName: clients.firstName });
  const company = await db.admin
    .insert(clients)
    .values({ organizationId: orgId, kind: 'company', companyName: 'Inversiones del Sur SA', taxId: '30712345671', createdBy: user.id })
    .returning({ id: clients.id });
  const id = (name: string) => inserted.find((c) => c.firstName === name)!.id;
  await db.admin.insert(clientContacts).values(
    people.flatMap((p, i) => [
      { organizationId: orgId, clientId: inserted[i]!.id, type: 'email' as const, value: p.contact.email, isPrimary: true },
      { organizationId: orgId, clientId: inserted[i]!.id, type: 'phone' as const, value: p.contact.phone, isPrimary: true },
    ]),
  );

  // 4. Properties.
  const property = async (street: string, streetNumber: string, unit: string | null, type: 'apartment' | 'house' | 'commercial', owners: [string, string][]) => {
    const [p] = await db.admin
      .insert(properties)
      .values({ organizationId: orgId, street, streetNumber, unit, city: 'CABA', region: 'CABA', type, createdBy: user.id })
      .returning({ id: properties.id });
    await db.admin.insert(propertyOwners).values(owners.map(([clientId, pct]) => ({ organizationId: orgId, propertyId: p!.id, clientId, ownershipPct: pct })));
    return { id: p!.id, owners };
  };
  const palermo = await property('Gurruchaga', '1456', '3° B', 'apartment', [[id('Pedro'), '100']]);
  const local = await property('Av. Corrientes', '2380', 'PB', 'commercial', [[company[0]!.id, '100']]);
  const casa = await property('Juan B. Justo', '4356', null, 'house', [[id('Laura'), '50'], [id('Jorge'), '50']]);
  await property('Paraguay', '3270', '2° C', 'apartment', [[id('Pedro'), '100']]);

  const [ipc] = await db.admin.select().from(schema.indexSeries).where(eq(schema.indexSeries.code, 'AR_IPC'));
  const [icl] = await db.admin.select().from(schema.indexSeries).where(eq(schema.indexSeries.code, 'AR_ICL'));

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
    const [c] = await db.admin
      .insert(contracts)
      .values({
        organizationId: orgId,
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
        createdBy: user.id,
      })
      .returning();
    await db.admin.insert(contractParties).values([
      ...opts.owners.map(([clientId, pct]) => ({ organizationId: orgId, contractId: c!.id, clientId, role: 'owner' as const, sharePct: pct })),
      { organizationId: orgId, contractId: c!.id, clientId: opts.tenantId, role: 'tenant' as const },
      ...(opts.guarantorId ? [{ organizationId: orgId, contractId: c!.id, clientId: opts.guarantorId, role: 'guarantor' as const }] : []),
    ]);
    const plan = planPeriods(
      { startDate: opts.startDate, endDate: opts.endDate },
      opts.update.months,
      { year: Number(opts.firstBilledMonth.slice(0, 4)), month: Number(opts.firstBilledMonth.slice(5, 7)) },
    );
    await db.admin.insert(rentPeriods).values(
      plan.map((p) => ({
        organizationId: orgId,
        contractId: c!.id,
        periodNumber: p.number,
        startMonth: `${formatYearMonth(p.startMonth)}-01`,
        endMonth: `${formatYearMonth(p.endMonth)}-01`,
        status: p.status,
        amount: p.status === 'initial' ? opts.amount : null,
      })),
    );
    await db.admin.insert(contractEvents).values({ organizationId: orgId, contractId: c!.id, type: 'created', createdBy: user.id });
    await db.admin.update(properties).set({ status: 'rented' }).where(eq(properties.id, opts.propertyId));
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
  await db.admin.insert(recurringCharges).values({
    organizationId: orgId,
    contractId: c1.id,
    title: 'Expensas',
    currency: 'ARS',
    startMonth: monthStart(current, -1),
    lastAmount: '85000',
    requiresConfirmation: true,
    createdBy: user.id,
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
  const updates = await applyRentUpdates(db.admin, { now, organizationId: orgId });
  const charges = await generateCharges(db.admin, { now, organizationId: orgId });
  console.log('Agencia demo creada:', { organizationId: orgId, updates, charges });
  console.log('Datos de acceso: packages/jobs/src/seed-demo-credentials.ts');
} finally {
  await db.close();
}
