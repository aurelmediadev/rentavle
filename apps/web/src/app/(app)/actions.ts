"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { loadSampleData } from "@rentavle/jobs";
import { ACTIVE_ORG_COOKIE, asUser, getActiveMembership, getMemberships, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

async function setActiveOrganization(organizationId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function switchOrganization(organizationId: string) {
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.organizationId === organizationId)) {
    throw new Error("No pertenecés a esa organización");
  }
  await setActiveOrganization(organizationId);
  redirect("/panel");
}

/**
 * Creates the sample agency next to the active one, fills it with demo data and
 * switches to it. The data is written by server code (like a job) into the
 * agency just created for it.
 */
export async function createSampleAgency() {
  const { organizationId } = await requireRole("admin");
  const sampleId = await asUser(async (tx, user) => {
    const rows = await tx.execute<{ id: string }>(sql`select public.create_sample_organization(${organizationId}) as id`);
    return { id: rows[0]!.id, userId: user.id };
  });
  await loadSampleData(db.admin, sampleId.id, sampleId.userId, new Date());
  await setActiveOrganization(sampleId.id);
  redirect("/panel");
}

/** Deletes the active sample agency (everything in it) and goes back to the real one. */
export async function deleteSampleAgency() {
  const { organizationId } = await requireRole("admin");
  const parent = await asUser(async (tx) => {
    const [org] = await tx
      .select({ sampleOf: schema.organizations.sampleOf })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    await tx.execute(sql`select public.delete_sample_organization(${organizationId})`);
    return org?.sampleOf ?? null;
  });
  if (parent) await setActiveOrganization(parent);
  redirect("/panel");
}

/** Hides the first-steps checklist for the whole agency. */
export async function dismissOnboarding() {
  const { organizationId } = await getActiveMembership();
  await requireRole("admin");
  await asUser((tx) =>
    tx.update(schema.organizations).set({ onboardingCompletedAt: new Date() }).where(eq(schema.organizations.id, organizationId)),
  );
  redirect("/panel");
}
