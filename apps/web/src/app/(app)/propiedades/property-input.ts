import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { type FormState, formValues, validationError } from "@/lib/forms";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" || v === "none" ? null : v))
  .nullable()
  .default(null);

const PROPERTY_TYPES = ["apartment", "house", "commercial", "office", "parking", "land", "other"] as const;
const PROPERTY_STATUSES = ["available", "rented", "unavailable"] as const;

const schema = z.object({
  type: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES).default("available"),
  street: z.string().trim().min(1, "Ingresá la calle"),
  streetNumber: optional,
  unit: optional,
  city: optional,
  region: optional,
  postalCode: optional,
  cadastralId: optional,
  notes: optional,
  owners: z
    .array(
      z.object({
        clientId: z.uuid("Elegí el propietario"),
        pct: z
          .string()
          .trim()
          .regex(/^\d{1,3}([.,]\d{1,2})?$/, "Porcentaje inválido")
          .transform((v) => v.replace(",", ".")),
      }),
    )
    .min(1, "Agregá al menos un propietario"),
});

export type PropertyInput = z.output<typeof schema>;

export function parsePropertyForm(formData: FormData): { ok: true; data: PropertyInput } | { ok: false; state: FormState } {
  const ownerIds = formData.getAll("ownerId").map(String);
  const ownerPcts = formData.getAll("ownerPct").map(String);
  const owners = ownerIds
    .map((clientId, i) => ({ clientId, pct: ownerPcts[i] ?? "" }))
    .filter((o) => o.clientId !== "");

  const raw = Object.fromEntries(
    [...formData.entries()].filter(([key]) => !key.startsWith("owner") && !key.startsWith("$ACTION")),
  );
  const parsed = schema.safeParse({ ...raw, owners });
  if (!parsed.success) {
    const state = validationError(parsed.error, formData);
    if (parsed.error.issues.some((i) => i.path[0] === "owners")) {
      const first = parsed.error.issues.find((i) => i.path[0] === "owners");
      state.fieldErrors = { ...state.fieldErrors, owners: [first?.message ?? "Revisá los propietarios"] };
    }
    return { ok: false, state };
  }

  const ids = new Set(parsed.data.owners.map((o) => o.clientId));
  if (ids.size !== parsed.data.owners.length) {
    return { ok: false, state: { fieldErrors: { owners: ["Hay un propietario repetido"] }, values: formValues(formData) } };
  }
  const total = parsed.data.owners.reduce((acc, o) => acc.plus(o.pct), new Decimal(0));
  if (!total.equals(100)) {
    return {
      ok: false,
      state: {
        fieldErrors: { owners: [`Los porcentajes deben sumar 100% (suman ${total.toString()}%)`] },
        values: formValues(formData),
      },
    };
  }
  return { ok: true, data: parsed.data };
}
