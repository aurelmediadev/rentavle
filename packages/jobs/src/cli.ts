/**
 * Runs a job from the terminal, e.g. `pnpm --filter @rentavle/jobs fetch-indexes`.
 * Uses DATABASE_URL (defaults to the local Supabase database).
 */
import { createDbClients } from '@rentavle/db';
import { applyRentUpdates } from './apply-rent-updates';
import { fetchIndexes } from './fetch-indexes';
import { generateCharges } from './generate-charges';

const db = createDbClients(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');
const command = process.argv[2];

try {
  const now = new Date();
  if (command === 'fetch-indexes') {
    console.table(await fetchIndexes(db.admin, now.toISOString().slice(0, 10)));
  } else if (command === 'apply-rent-updates') {
    console.table(await applyRentUpdates(db.admin, { now }));
  } else if (command === 'generate-charges') {
    console.table(await generateCharges(db.admin, { now }));
  } else {
    console.error('Usage: cli.ts fetch-indexes | apply-rent-updates | generate-charges');
    process.exitCode = 1;
  }
} finally {
  await db.close();
}
