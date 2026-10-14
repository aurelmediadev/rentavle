"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, getMemberships } from "@/lib/auth";

export async function switchOrganization(organizationId: string) {
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.organizationId === organizationId)) {
    throw new Error("No pertenecés a esa organización");
  }
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/panel");
}
