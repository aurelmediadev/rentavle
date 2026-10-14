"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rentavle/db";
import { asUser, requireRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { type FormState, formValues, validationError } from "@/lib/forms";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inviteSchema = z.object({
  email: z.email("Ingresá un email válido").trim().toLowerCase(),
  role: z.enum(["admin", "operator"]),
});

export interface InviteState extends FormState {
  link?: string;
}

export async function inviteMember(_: InviteState, formData: FormData): Promise<InviteState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const membership = await requireRole("admin");
  const token = randomBytes(32).toString("base64url");

  await asUser(async (tx, user) => {
    // A new invitation replaces any pending one for the same email.
    await tx
      .delete(schema.invitations)
      .where(
        and(
          eq(schema.invitations.organizationId, membership.organizationId),
          eq(schema.invitations.email, parsed.data.email),
        ),
      );
    await tx.insert(schema.invitations).values({
      organizationId: membership.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
  });

  revalidatePath("/configuracion/usuarios");
  // Email delivery arrives with Resend (Fase 1); until then the admin shares the link.
  return {
    ok: true,
    message: `Invitación creada para ${parsed.data.email}. Compartile este link (vence en 7 días):`,
    link: `${env.siteUrl}/invitacion/${token}`,
    values: { role: formValues(formData).role ?? "operator" },
  };
}

export async function revokeInvitation(invitationId: string) {
  const membership = await requireRole("admin");
  await asUser((tx) =>
    tx
      .delete(schema.invitations)
      .where(
        and(
          eq(schema.invitations.id, invitationId),
          eq(schema.invitations.organizationId, membership.organizationId),
        ),
      ),
  );
  revalidatePath("/configuracion/usuarios");
}

export async function removeMember(membershipId: string): Promise<{ error?: string }> {
  const membership = await requireRole("admin");
  try {
    await asUser((tx) =>
      tx
        .delete(schema.memberships)
        .where(
          and(
            eq(schema.memberships.id, membershipId),
            eq(schema.memberships.organizationId, membership.organizationId),
          ),
        ),
    );
  } catch (error) {
    const message = (error as { cause?: { message?: string } }).cause?.message;
    return { error: message ?? "No se pudo quitar al usuario" };
  }
  revalidatePath("/configuracion/usuarios");
  return {};
}
