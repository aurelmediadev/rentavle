"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getCountryPack, isCountryCode } from "@rentavle/country";
import { ACTIVE_ORG_COOKIE, asUser } from "@/lib/auth";
import { type FormState, formValues, validationError } from "@/lib/forms";

const TRIAL_DAYS = 21;

const schema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre de la inmobiliaria").max(120),
  country: z.string().refine(isCountryCode, "Elegí un país"),
  taxId: z.string().trim().min(1, "Ingresá el número fiscal"),
});

export async function createOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const pack = getCountryPack(parsed.data.country);
  const taxId = pack.taxId.normalize(parsed.data.taxId);
  if (!taxId) {
    return { fieldErrors: { taxId: [`El ${pack.taxId.label} no es válido`] }, values: formValues(formData) };
  }

  let organizationId: string;
  try {
    organizationId = await asUser(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        select public.create_organization(
          ${parsed.data.name}, ${pack.code}, ${pack.defaultCurrency},
          ${pack.defaultTimezone}, ${pack.defaultLocale}, ${taxId}, ${TRIAL_DAYS}
        ) as id
      `);
      return rows[0]!.id;
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") {
      return {
        fieldErrors: {
          taxId: [`Ya hay una cuenta con ese ${pack.taxId.label}. Pedile al administrador que te invite.`],
        },
        values: formValues(formData),
      };
    }
    throw error;
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
