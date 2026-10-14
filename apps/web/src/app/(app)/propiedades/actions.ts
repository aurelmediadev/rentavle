"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { insertProperty, setPropertyArchived, updateProperty } from "./data";
import { parsePropertyForm } from "./property-input";

export async function createProperty(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parsePropertyForm(formData);
  if (!parsed.ok) return parsed.state;

  const created = await insertProperty(parsed.data);
  revalidatePath("/propiedades");
  redirect(`/propiedades/${created.number}`);
}

export async function editProperty(propertyId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = parsePropertyForm(formData);
  if (!parsed.ok) return parsed.state;

  const updated = await updateProperty(propertyId, parsed.data);
  if (!updated) return { message: "No encontramos la propiedad" };
  revalidatePath("/propiedades");
  redirect(`/propiedades/${updated.number}`);
}

export async function archiveProperty(propertyId: string, archived: boolean) {
  await setPropertyArchived(propertyId, archived);
  revalidatePath("/propiedades");
}
