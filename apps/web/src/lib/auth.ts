import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import type { JwtClaims, Transaction } from "@rentavle/db";
import { schema } from "@rentavle/db";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Data access layer: every page and Server Action resolves the user and the
 * active organization here, close to the data (docs/05-arquitectura.md).
 */

export const ACTIVE_ORG_COOKIE = "rentavle_org";

export type Role = (typeof schema.membershipRole.enumValues)[number];

export interface CurrentUser {
  id: string;
  email: string;
  claims: JwtClaims;
}

export interface ActiveMembership {
  organizationId: string;
  organizationName: string;
  countryCode: string;
  role: Role;
}

/** Verified user or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as JwtClaims;
  return { id: claims.sub, email: String(claims.email ?? ""), claims };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  return user;
}

/** Runs queries as the signed-in user, with RLS enforced. */
export async function asUser<T>(fn: (tx: Transaction, user: CurrentUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return db.withUser(user.claims, (tx) => fn(tx, user));
}

export const getMemberships = cache(async (): Promise<ActiveMembership[]> => {
  return asUser((tx, user) =>
    tx
      .select({
        organizationId: schema.memberships.organizationId,
        organizationName: schema.organizations.name,
        countryCode: schema.organizations.countryCode,
        role: schema.memberships.role,
      })
      .from(schema.memberships)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
      .where(eq(schema.memberships.userId, user.id))
      .orderBy(asc(schema.organizations.name)),
  );
});

/** Organization the user is working in; sends them to onboarding if they have none. */
export const getActiveMembership = cache(async (): Promise<ActiveMembership> => {
  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/bienvenida");

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return memberships.find((m) => m.organizationId === preferred) ?? memberships[0]!;
});

export async function requireRole(role: Role): Promise<ActiveMembership> {
  const membership = await getActiveMembership();
  if (role === "admin" && membership.role !== "admin") {
    throw new Error("No tenés permisos para esta acción");
  }
  return membership;
}
