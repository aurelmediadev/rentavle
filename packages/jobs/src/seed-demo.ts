/**
 * Creates (or recreates) a demo agency with sample data in the LOCAL database, to
 * explore the app: `pnpm --filter @rentavle/jobs seed-demo`.
 *
 * Refuses to run against anything other than localhost. The demo account below
 * only exists in the local Supabase stack.
 */
import { eq, sql } from 'drizzle-orm';
import { createDbClients, schema } from '@rentavle/db';
import { loadSampleData } from './sample-data';
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed-demo-credentials';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DATABASE_URL) || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(SUPABASE_URL)) {
  throw new Error('seed-demo only runs against the local Supabase stack');
}
if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY (see `pnpm exec supabase status`)');

const { organizations } = schema;
const db = createDbClients(DATABASE_URL);

async function authAdmin(path: string, init: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY!, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
  });
  if (!response.ok) throw new Error(`auth admin ${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<{ id: string }>;
}

try {
  const now = new Date();

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

  // 3. Sample clients, properties, contracts and this month's debts.
  const { updates, charges } = await loadSampleData(db.admin, orgId, user.id, now);
  console.log('Agencia demo creada:', { organizationId: orgId, updates, charges });
  console.log('Datos de acceso: packages/jobs/src/seed-demo-credentials.ts');
} finally {
  await db.close();
}
