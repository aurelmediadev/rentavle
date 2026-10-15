import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Internal admin panel (Rentavle staff). Every query goes through the database's
 * admin_* functions, which check the caller is staff; this layer just hides the
 * panel from everyone else.
 */
async function asStaff<T>(fn: (tx: Parameters<Parameters<typeof db.withUser>[1]>[0]) => Promise<T>): Promise<T> {
  const user = await getCurrentUser();
  if (!user) notFound();
  return db.withUser(user.claims, fn);
}

export const isPlatformAdmin = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return false;
  const [row] = await db.withUser(user.claims, (tx) => tx.execute<{ ok: boolean }>(sql`select private.is_platform_admin() as ok`));
  return Boolean(row?.ok);
});

export async function requirePlatformAdmin() {
  if (!(await isPlatformAdmin())) notFound();
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  tax_id: string | null;
  country_code: string;
  created_at: string;
  subscription_status: "trialing" | "active" | "past_due" | "read_only" | "cancelled";
  trial_ends_at: string | null;
  plan_name: string | null;
  active_contracts: number;
  members: number;
  owner_email: string | null;
  last_payment_at: string | null;
}

export async function adminOrganizations(query: string | undefined) {
  await requirePlatformAdmin();
  return asStaff((tx) => tx.execute<AdminOrganizationRow & Record<string, unknown>>(sql`select * from public.admin_organizations(${query?.trim() || null})`));
}

export interface AdminOrganizationDetail {
  organization: {
    id: string;
    name: string;
    legal_name: string | null;
    tax_id: string | null;
    country_code: string;
    email: string | null;
    phone: string | null;
    created_at: string;
    subscription_status: AdminOrganizationRow["subscription_status"];
    trial_ends_at: string | null;
    extra_contract_blocks: number;
    plan_code: string | null;
    plan_name: string | null;
  };
  usage: { active_contracts: number; clients: number; properties: number; limit: number | null };
  members: { email: string; role: string; created_at: string }[];
  subscriptions: {
    id: string;
    plan: string;
    cycle: string;
    amount: string;
    currency: string;
    status: string;
    provider: string;
    provider_subscription_id: string | null;
    next_payment_date: string | null;
    created_at: string;
  }[];
  payments: { amount: string; currency: string; status: string; paid_at: string | null; provider_payment_id: string; created_at: string }[];
  audit: { action: string; details: { note?: string; before?: Record<string, unknown>; after?: Record<string, unknown> }; created_at: string; actor: string | null }[];
}

export async function adminOrganizationDetail(id: string): Promise<AdminOrganizationDetail | null> {
  await requirePlatformAdmin();
  const [row] = await asStaff((tx) => tx.execute<{ d: AdminOrganizationDetail | null }>(sql`select public.admin_organization_detail(${id}) as d`));
  return row?.d ?? null;
}

export async function adminSetAccess(input: {
  organizationId: string;
  status: AdminOrganizationRow["subscription_status"];
  planCode: string | null;
  extraBlocks: number;
  /** YYYY-MM-DD: the trial ends at the end of that day, agency time. */
  trialEndsOn: string | null;
  note: string;
}) {
  await requirePlatformAdmin();
  await asStaff((tx) =>
    tx.execute(sql`select public.admin_set_access(
      ${input.organizationId}, ${input.status}::public.subscription_status, ${input.planCode},
      ${input.extraBlocks}, ${input.trialEndsOn}::date, ${input.note})`),
  );
}
