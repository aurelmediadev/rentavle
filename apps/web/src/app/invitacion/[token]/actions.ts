"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { ACTIVE_ORG_COOKIE, asUser } from "@/lib/auth";

export async function acceptInvitation(token: string): Promise<{ error?: string }> {
  let organizationId: string;
  try {
    organizationId = await asUser(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`select public.accept_invitation(${token}) as id`);
      return rows[0]!.id;
    });
  } catch (error) {
    const message = (error as { cause?: { message?: string } }).cause?.message;
    return { error: message ?? "No se pudo aceptar la invitación" };
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
