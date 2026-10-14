import "server-only";
import { z } from "zod";
import { getCountryPack } from "@rentavle/country";
import { type FormState, formValues, validationError } from "@/lib/forms";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" || v === "none" ? null : v))
  .nullable()
  .default(null);

const contact = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), value: z.email("Email inválido").trim().toLowerCase(), label: optional }),
  z.object({
    type: z.literal("phone"),
    value: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{6,20}$/, "Teléfono inválido"),
    label: optional,
  }),
]);

const schema = z
  .object({
    kind: z.enum(["person", "company"]),
    firstName: optional,
    lastName: optional,
    companyName: optional,
    docType: optional,
    docNumber: optional,
    taxId: optional,
    taxCondition: optional,
    nationality: optional,
    birthDate: optional.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida"),
    notes: optional,
    street: optional,
    streetNumber: optional,
    unit: optional,
    city: optional,
    region: optional,
    postalCode: optional,
    contacts: z.array(contact).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "person") {
      if (!v.firstName) ctx.addIssue({ code: "custom", path: ["firstName"], message: "Ingresá el nombre" });
      if (!v.lastName) ctx.addIssue({ code: "custom", path: ["lastName"], message: "Ingresá el apellido" });
    } else if (!v.companyName) {
      ctx.addIssue({ code: "custom", path: ["companyName"], message: "Ingresá la razón social" });
    }
  });

export type ClientInput = z.output<typeof schema>;

/** Contacts arrive as parallel lists: contactType[], contactValue[], contactLabel[]. */
function readContacts(formData: FormData) {
  const types = formData.getAll("contactType").map(String);
  const values = formData.getAll("contactValue").map(String);
  const labels = formData.getAll("contactLabel").map(String);
  return types
    .map((type, i) => ({ type, value: values[i] ?? "", label: labels[i] ?? "" }))
    .filter((c) => c.value.trim() !== "");
}

export function parseClientForm(
  formData: FormData,
  countryCode: string,
): { ok: true; data: ClientInput } | { ok: false; state: FormState } {
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([key]) => !key.startsWith("contact") && !key.startsWith("$ACTION")),
  );
  const parsed = schema.safeParse({ ...raw, contacts: readContacts(formData) });
  if (!parsed.success) {
    const state = validationError(parsed.error, formData);
    // Contact errors are reported on the contacts block as a whole.
    if (parsed.error.issues.some((i) => i.path[0] === "contacts")) {
      state.fieldErrors = { ...state.fieldErrors, contacts: ["Revisá los emails y teléfonos"] };
    }
    return { ok: false, state };
  }

  const data = parsed.data;
  if (data.kind === "person") data.companyName = null;
  else {
    data.firstName = null;
    data.lastName = null;
    data.birthDate = null;
  }

  if (data.taxId) {
    const pack = getCountryPack(countryCode);
    const canonical = pack.taxId.normalize(data.taxId);
    if (!canonical) {
      return {
        ok: false,
        state: { fieldErrors: { taxId: [`El ${pack.taxId.label} no es válido`] }, values: formValues(formData) },
      };
    }
    data.taxId = canonical;
  }
  if (data.docNumber) data.docNumber = data.docNumber.replace(/[.\s]/g, "");
  return { ok: true, data };
}
