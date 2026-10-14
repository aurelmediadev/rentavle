"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
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

export async function createContract(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseContractForm(formData);
  if (!parsed.ok) return parsed.state;

  let created: { number: number };
  try {
    created = await insertContract(parsed.data);
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
  const parsed = endDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: { endDate: ["Elegí una fecha"] }, values: formValues(formData) };
  try {
    await changeEndDate(contractId, kind, parsed.data.endDate, parsed.data.reason);
  } catch (error) {
    if (error instanceof ContractConflictError) return { fieldErrors: { endDate: [error.message] }, values: formValues(formData) };
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/propiedades");
  return { ok: true, message: kind === "extend" ? "Contrato prorrogado" : "Rescisión registrada" };
}

export async function cancelContractTermination(contractId: string): Promise<{ error?: string }> {
  try {
    await cancelTermination(contractId);
  } catch (error) {
    if (error instanceof ContractConflictError) return { error: error.message };
    throw error;
  }
  revalidatePath("/contratos");
  return {};
}

export async function finishContract(contractId: string, finished: boolean): Promise<{ error?: string }> {
  try {
    await setFinished(contractId, finished, null);
  } catch (error) {
    if (error instanceof ContractConflictError) return { error: error.message };
    throw error;
  }
  revalidatePath("/contratos");
  revalidatePath("/propiedades");
  return {};
}
