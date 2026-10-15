"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCountryPack } from "@rentavle/country";
import { schema } from "@rentavle/db";
import { asUser, requireRole } from "@/lib/auth";
import { type FormState, formValues, validationError } from "@/lib/forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const optional = z
  .string()
  .trim()
  .max(200)
  .transform((v) => v || null);

const agencySchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre").max(120),
  legalName: optional,
  taxId: optional,
  taxCondition: optional,
  address: optional,
  phone: optional,
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email("Email inválido").nullable()),
});

/** Name, fiscal data and contact printed on documents. */
export async function updateAgency(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = agencySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const { organizationId, countryCode } = await requireRole("admin");
  const pack = getCountryPack(countryCode);

  let taxId: string | null = null;
  if (parsed.data.taxId) {
    taxId = pack.taxId.normalize(parsed.data.taxId);
    if (!taxId) return { fieldErrors: { taxId: [`${pack.taxId.label} inválido`] }, values: formValues(formData) };
  }
  const taxCondition = pack.taxConditions.some((o) => o.value === parsed.data.taxCondition) ? parsed.data.taxCondition : null;

  try {
    await asUser((tx) =>
      tx
        .update(schema.organizations)
        .set({ ...parsed.data, taxId, taxCondition })
        .where(eq(schema.organizations.id, organizationId)),
    );
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") {
      return { fieldErrors: { taxId: [`Ese ${pack.taxId.label} ya está registrado en otra inmobiliaria`] }, values: formValues(formData) };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Datos guardados. Se usan en los documentos que emitas desde ahora.", values: formValues(formData) };
}

const MAX_IMAGE_BYTES = 500 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * Uploads the logo or signature. Each upload gets a new name and old files are
 * kept: documents already issued keep pointing at the image they printed.
 */
export async function uploadBrandingImage(kind: "logo" | "signature", _: FormState, formData: FormData): Promise<FormState> {
  const { organizationId } = await requireRole("admin");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Elegí una imagen" };
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return { message: "La imagen tiene que ser PNG o JPG" };
  if (file.size > MAX_IMAGE_BYTES) return { message: "La imagen supera los 500 KB" };

  const path = `${organizationId}/${kind}-${randomUUID()}.${extension}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type });
  if (error) return { message: `No se pudo subir la imagen: ${error.message}` };

  await asUser((tx) =>
    tx
      .update(schema.organizations)
      .set(kind === "logo" ? { logoPath: path } : { signaturePath: path })
      .where(eq(schema.organizations.id, organizationId)),
  );
  revalidatePath("/configuracion/inmobiliaria");
  return { ok: true, message: kind === "logo" ? "Logo actualizado" : "Firma actualizada" };
}

export async function removeBrandingImage(kind: "logo" | "signature"): Promise<FormState> {
  const { organizationId } = await requireRole("admin");
  await asUser((tx) =>
    tx
      .update(schema.organizations)
      .set(kind === "logo" ? { logoPath: null } : { signaturePath: null })
      .where(eq(schema.organizations.id, organizationId)),
  );
  revalidatePath("/configuracion/inmobiliaria");
  return { ok: true, message: kind === "logo" ? "Logo quitado" : "Firma quitada" };
}
