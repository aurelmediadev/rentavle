"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import { type FormState, validationError } from "@/lib/forms";
import { parseClientForm } from "./client-input";
import { insertClient, setClientArchived, updateClient } from "./data";

export async function createClient(_: FormState, formData: FormData): Promise<FormState> {
  const { countryCode } = await getActiveMembership();
  const parsed = parseClientForm(formData, countryCode);
  if (!parsed.ok) return parsed.state;

  const created = await insertClient(parsed.data);
  revalidatePath("/clientes");
  redirect(`/clientes/${created.number}`);
}

export async function editClient(clientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { countryCode } = await getActiveMembership();
  const parsed = parseClientForm(formData, countryCode);
  if (!parsed.ok) return parsed.state;

  const updated = await updateClient(clientId, parsed.data);
  if (!updated) return { message: "No encontramos el cliente" };
  revalidatePath("/clientes");
  redirect(`/clientes/${updated.number}`);
}

export async function archiveClient(clientId: string, archived: boolean) {
  await setClientArchived(clientId, archived);
  revalidatePath("/clientes");
}

const bankAccountSchema = z
  .object({
    bankName: z.string().trim().max(120).optional(),
    holderName: z.string().trim().max(160).optional(),
    cbu: z
      .string()
      .trim()
      .regex(/^(\d{22})?$/, "El CBU/CVU tiene 22 dígitos")
      .optional(),
    alias: z
      .string()
      .trim()
      .regex(/^([a-zA-Z0-9.-]{6,20})?$/, "El alias tiene entre 6 y 20 caracteres (letras, números, punto o guion)")
      .optional(),
    currency: z.string().length(3),
  })
  .refine((v) => v.cbu || v.alias, { message: "Ingresá CBU/CVU o alias", path: ["cbu"] });

export async function addBankAccount(clientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = bankAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const { organizationId } = await getActiveMembership();
  await asUser((tx) =>
    tx.insert(schema.bankAccounts).values({
      organizationId,
      ownerType: "client",
      clientId,
      bankName: parsed.data.bankName || null,
      holderName: parsed.data.holderName || null,
      cbu: parsed.data.cbu || null,
      alias: parsed.data.alias?.toLowerCase() || null,
      currency: parsed.data.currency,
    }),
  );
  revalidatePath("/clientes");
  return { ok: true, message: "Cuenta agregada" };
}

export async function removeBankAccount(bankAccountId: string) {
  const { organizationId } = await getActiveMembership();
  await asUser((tx) =>
    tx
      .update(schema.bankAccounts)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.bankAccounts.id, bankAccountId), eq(schema.bankAccounts.organizationId, organizationId))),
  );
  revalidatePath("/clientes");
}
