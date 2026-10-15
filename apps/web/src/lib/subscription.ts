import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { createBillingProvider } from "@rentavle/billing";
import { schema } from "@rentavle/db";
import { accessFor, contractLimit } from "@rentavle/domain";
import { asUser, getActiveMembership } from "@/lib/auth";
import { env } from "@/lib/env";
import { formValues } from "@/lib/forms";

const { organizations, plans, contracts, subscriptions } = schema;

/** The active agency's plan, usage and access (trial, active, read-only). Deduplicated per request. */
export const getSubscriptionState = cache(async () => {
  const { organizationId, countryCode, role } = await getActiveMembership();
  const now = new Date();
  return asUser(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, organizationId));
    const [countryPlans, [usage], latest] = await Promise.all([
      tx.select().from(plans).where(and(eq(plans.countryCode, countryCode), eq(plans.isActive, true))).orderBy(asc(plans.sortOrder)),
      tx
        .select({ active: sql<number>`count(*)::int` })
        .from(contracts)
        .where(and(eq(contracts.organizationId, organizationId), eq(contracts.status, "active"), isNull(contracts.deletedAt))),
      // Subscriptions are visible to admins only (RLS): operators get none.
      role === "admin"
        ? tx.select().from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).orderBy(desc(subscriptions.createdAt)).limit(1)
        : Promise.resolve([]),
    ]);
    const plan = countryPlans.find((p) => p.id === org!.planId) ?? null;
    return {
      org: org!,
      plan,
      plans: countryPlans,
      activeContracts: usage?.active ?? 0,
      limit: contractLimit(org!.subscriptionStatus, plan, org!.extraContractBlocks),
      access: accessFor({ status: org!.subscriptionStatus, trialEndsAt: org!.trialEndsAt }, now),
      latest: latest[0] ?? null,
    };
  });
});

export function billingProvider() {
  return createBillingProvider(process.env, env.siteUrl);
}

export const READ_ONLY_MESSAGE = "La cuenta está en modo solo lectura: elegí un plan en Suscripción para seguir cargando datos.";

/**
 * For Server Actions that change business data: a form error when the account
 * is read-only (the database would reject the change anyway), keeping what was typed.
 */
export async function readOnlyBlock(formData?: FormData) {
  const { access } = await getSubscriptionState();
  if (access.writable) return null;
  return { ok: false as const, message: READ_ONLY_MESSAGE, values: formData ? formValues(formData) : undefined };
}

/** Same check for actions without a form state: throws. */
export async function assertWritable() {
  if (await readOnlyBlock()) throw new Error(READ_ONLY_MESSAGE);
}
