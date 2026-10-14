"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rentavle/db";
import { applyRentUpdates } from "@rentavle/jobs";
import { asUser, getActiveMembership, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { type FormState, formValues } from "@/lib/forms";
import { parseLocaleDecimal } from "@/lib/numbers";

/**
 * Runs the rent update job for the active organization only. The job writes
 * with the admin client; the membership check above scopes it to this agency.
 */
export async function recalculateUpdates(): Promise<{ calculated: number; waiting: number }> {
  const { organizationId } = await getActiveMembership();
  const result = await applyRentUpdates(db.admin, { now: new Date(), organizationId });
  revalidatePath("/contratos");
  return { calculated: result.calculated + result.provisional, waiting: result.waitingForIndex };
}

const adjustSchema = z.object({
  amount: z.string(),
  reason: z.string().trim().min(3, "Contá brevemente el motivo del ajuste"),
});

/** Sets an update period's amount by hand; the job never overwrites it afterwards. */
export async function adjustPeriodAmount(periodId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  const amount = parseLocaleDecimal(String(formData.get("amount") ?? ""));
  const fieldErrors: Record<string, string[]> = {};
  if (!amount || new Decimal(amount).lte(0)) fieldErrors.amount = ["Ingresá el monto"];
  if (!parsed.success) fieldErrors.reason = parsed.error.issues.map((i) => i.message);
  if (!parsed.success || !amount || fieldErrors.amount) return { fieldErrors, values: formValues(formData) };

  const { organizationId } = await getActiveMembership();
  const updated = await asUser(async (tx, user) => {
    const [period] = await tx
      .select()
      .from(schema.rentPeriods)
      .where(and(eq(schema.rentPeriods.id, periodId), eq(schema.rentPeriods.organizationId, organizationId)));
    if (!period || !["pending", "pending_index", "provisional", "calculated", "manually_adjusted"].includes(period.status)) {
      return null;
    }
    const [previous] = await tx
      .select({ amount: schema.rentPeriods.amount })
      .from(schema.rentPeriods)
      .where(and(eq(schema.rentPeriods.contractId, period.contractId), eq(schema.rentPeriods.periodNumber, period.periodNumber - 1)));
    await tx
      .update(schema.rentPeriods)
      .set({
        status: "manually_adjusted",
        amount,
        previousAmount: previous?.amount ?? period.previousAmount,
        notes: parsed.data.reason,
        calculatedAt: new Date(),
      })
      .where(eq(schema.rentPeriods.id, period.id));
    await tx.insert(schema.contractEvents).values({
      organizationId,
      contractId: period.contractId,
      type: "updated",
      reason: parsed.data.reason,
      payload: { period: period.periodNumber, previousAmount: period.amount, newAmount: amount },
      createdBy: user.id,
    });
    return period;
  });
  if (!updated) return { message: "Este período no se puede ajustar" };

  revalidatePath("/contratos");
  return { ok: true, message: "Monto ajustado" };
}

const modeSchema = z.enum(["real", "provisional"]);

export async function setIpcMode(mode: string) {
  const parsed = modeSchema.parse(mode);
  const { organizationId } = await requireRole("admin");
  await asUser(async (tx) => {
    const [org] = await tx
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    await tx
      .update(schema.organizations)
      .set({ settings: { ...(org?.settings as object), ipcMode: parsed } })
      .where(eq(schema.organizations.id, organizationId));
  });
  revalidatePath("/contratos/actualizaciones");
}
