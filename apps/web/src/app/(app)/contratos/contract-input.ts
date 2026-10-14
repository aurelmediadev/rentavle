import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { assertValidTerm, installmentNumber, parseYearMonth } from "@rentavle/domain";
import { type FormState, formValues, validationError } from "@/lib/forms";
import { parseLocaleDecimal } from "@/lib/numbers";

/** Values of the "Actualización" select: no update, an index series code, or a fixed percentage. */
export const NO_UPDATE = "none";
export const FIXED_PCT = "fixed_pct";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const decimalField = (message: string) =>
  z
    .string()
    .transform((v, ctx) => {
      const parsed = parseLocaleDecimal(v);
      if (parsed === null) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return parsed;
    });

const schema = z
  .object({
    propertyId: z.uuid("Elegí la propiedad"),
    tenantIds: z.array(z.uuid()).min(1, "Agregá al menos un inquilino"),
    guarantorIds: z.array(z.uuid()).default([]),
    startDate: isoDate,
    endDate: isoDate,
    firstBilledMonth: z.string().regex(/^\d{4}-\d{2}$/, "Mes inválido"),
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: decimalField("Ingresá el monto"),
    update: z.string().min(1),
    updateFrequencyMonths: z.coerce.number().int().min(1).max(36).optional(),
    fixedUpdatePct: z.string().optional(),
    feeType: z.enum(["pct", "fixed"]),
    feeValue: decimalField("Ingresá los honorarios"),
    feesOnLateInterest: z.literal("on").optional(),
    lateInterestDailyPct: decimalField("Porcentaje inválido"),
    dueDay: z.coerce.number().int().min(1, "Entre 1 y 28").max(28, "Entre 1 y 28"),
    lateInterestFrom: z.enum(["after_due", "day_1"]),
    collectionMethod: z.enum(["cash", "transfer_to_admin", "transfer_to_owner", "split_transfer"]),
    notes: z
      .string()
      .trim()
      .transform((v) => v || null)
      .optional(),
    renewedFromContractId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  })
  .superRefine((v, ctx) => {
    try {
      assertValidTerm({ startDate: v.startDate, endDate: v.endDate });
    } catch {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "La fecha de fin tiene que ser posterior al inicio" });
      return;
    }
    if (!installmentNumber({ startDate: v.startDate, endDate: v.endDate }, parseYearMonth(v.firstBilledMonth))) {
      ctx.addIssue({ code: "custom", path: ["firstBilledMonth"], message: "Tiene que ser un mes dentro del contrato" });
    }
    if (new Decimal(v.amount).lte(0)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Ingresá el monto" });
    if (v.update !== NO_UPDATE && !v.updateFrequencyMonths) {
      ctx.addIssue({ code: "custom", path: ["updateFrequencyMonths"], message: "Elegí cada cuántos meses" });
    }
    if (v.update === FIXED_PCT && parseLocaleDecimal(v.fixedUpdatePct ?? "") === null) {
      ctx.addIssue({ code: "custom", path: ["fixedUpdatePct"], message: "Ingresá el porcentaje" });
    }
    if (v.feeType === "pct" && new Decimal(v.feeValue).gt(100)) {
      ctx.addIssue({ code: "custom", path: ["feeValue"], message: "No puede superar el 100%" });
    }
    if (new Decimal(v.lateInterestDailyPct).gt(5)) {
      ctx.addIssue({ code: "custom", path: ["lateInterestDailyPct"], message: "Máximo 5% diario" });
    }
    const people = [...v.tenantIds, ...v.guarantorIds];
    if (new Set(people).size !== people.length) {
      ctx.addIssue({ code: "custom", path: ["tenantIds"], message: "Una misma persona figura dos veces" });
    }
  });

export type ContractInput = z.output<typeof schema>;

export function parseContractForm(
  formData: FormData,
): { ok: true; data: ContractInput } | { ok: false; state: FormState } {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || key === "tenantId" || key === "guarantorId") continue;
    raw[key] = value;
  }
  raw.tenantIds = formData.getAll("tenantId").map(String).filter(Boolean);
  raw.guarantorIds = formData.getAll("guarantorId").map(String).filter(Boolean);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const state = validationError(parsed.error, formData);
    return { ok: false, state: { ...state, values: formValues(formData) } };
  }
  const data = parsed.data;
  if (data.update === NO_UPDATE) data.updateFrequencyMonths = undefined;
  if (data.update === FIXED_PCT) data.fixedUpdatePct = parseLocaleDecimal(data.fixedUpdatePct!)!;
  else data.fixedUpdatePct = undefined;
  return { ok: true, data };
}
