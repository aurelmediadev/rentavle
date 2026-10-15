import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';
import { id } from './_shared';
import { organizations } from './organizations';

// Rentavle's own staff (internal admin panel). Rows are added from the terminal
// (`pnpm --filter @rentavle/jobs grant-platform-admin <email>`); everything else
// goes through security definer functions: "rls_platform" migration.

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** What staff changed in an organization's access (plan, status, trial), and why. */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: id(),
    actorId: uuid().references(() => authUsers.id, { onDelete: 'set null' }),
    organizationId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
    action: text().notNull(),
    details: jsonb().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('platform_audit_log_organization_idx').on(t.organizationId, t.createdAt)],
).enableRLS();
