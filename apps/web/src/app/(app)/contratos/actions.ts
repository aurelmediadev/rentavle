"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateCharges } from "@rentavle/jobs";
import { db } from "@/lib/db";
import { type FormState, formValues } from "@/lib/forms";
import { parseContractForm } from "./contract-input";
import {
  ContractConflictError,
  type EndDateChange,
  cancelTermination,
  changeEndDate,
  insertContract,
  setFinished,
} from "./data";
import { READ_ONLY_MESSAGE, readOnlyBlock } from "@/lib/subscription";

export async function createContract(_: FormState, formData: FormData): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const parsed = parseContractForm(formData);
  if (!parsed.ok) return parsed.state;

  let created: { id: string; number: number };
  try {
    created = await insertContract(parsed.data);
    // Debts of the months already due appear right away (the job is scoped to this contract).
    await generateCharges(db.admin, { now: new Date(), contractId: created.id });
  } catch (error) {
    if (error instanceof ContractConflictError) {
      return { fieldErrors: { startDate: [error.message] }, values: formValues(formData) };
    }
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/propiedades");
  redirect(`/contratos/${created.number}`);
}

const endDateSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  reason: z
    .string()
    .trim()
    .transform((v) => v || null),
});

export async function changeContractEndDate(
  contractId: string,
  kind: EndDateChange,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await readOnlyBlock(formData);
  if (blocked) return blocked;
  const parsed = endDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: { endDate: ["Elegí una fecha"] }, values: formValues(formData) };
  try {
    await changeEndDate(contractId, kind, parsed.data.endDate, parsed.data.reason);
    await generateCharges(db.admin, { now: new Date(), contractId });
  } catch (error) {
    if (error instanceof ContractConflictError) return { fieldErrors: { endDate: [error.message] }, values: formValues(formData) };
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/propiedades");
  return { ok: true, message: kind === "extend" ? "Contrato prorrogado" : "Rescisión registrada" };
}

export async function cancelContractTermination(contractId: string): Promise<{ error?: string }> {
  if (await readOnlyBlock()) return { error: READ_ONLY_MESSAGE };
  try {
    await cancelTermination(contractId);
    await generateCharges(db.admin, { now: new Date(), contractId });
  } catch (error) {
    if (error instanceof ContractConflictError) return { error: error.message };
    throw error;
  }
  revalidatePath("/contratos");
  return {};
}

export async function finishContract(contractId: string, finished: boolean): Promise<{ error?: string }> {
  if (await readOnlyBlock()) return { error: READ_ONLY_MESSAGE };
  try {
    await setFinished(contractId, finished, null);
    if (!finished) await generateCharges(db.admin, { now: new Date(), contractId });
  } catch (error) {
    if (error instanceof ContractConflictError) return { error: error.message };
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/propiedades");
  return {};
}
