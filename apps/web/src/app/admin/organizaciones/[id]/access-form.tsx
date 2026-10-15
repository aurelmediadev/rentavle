"use client";

import { useActionState } from "react";
import { Field, FormMessage, SelectField, SubmitButton, TextareaField } from "@/components/form";
import type { FormState } from "@/lib/forms";
import { setAccess } from "./actions";

const STATUSES = [
  { value: "trialing", label: "Prueba" },
  { value: "active", label: "Activa" },
  { value: "past_due", label: "Pago pendiente" },
  { value: "read_only", label: "Suspendida (solo lectura)" },
  { value: "cancelled", label: "Cancelada (solo lectura)" },
];

export function AccessForm({
  organizationId,
  initial,
  plans,
}: {
  organizationId: string;
  initial: { status: string; planCode: string; extraBlocks: string; trialEndsOn: string };
  plans: { value: string; label: string }[];
}) {
  const [state, action] = useActionState(setAccess.bind(null, organizationId), { values: initial } as FormState);
  const s = { ...state, values: { ...initial, ...state.values, ...(state.ok ? { note: "" } : {}) } };
  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="status" label="Estado" state={s} options={STATUSES} />
        <SelectField name="planCode" label="Plan" state={s} options={[{ value: "none", label: "Sin plan (sin cargo, sin límite)" }, ...plans]} />
        <Field name="extraBlocks" label="Bloques extra de contratos" type="number" min={0} max={100} state={s} hint="Solo para el plan más grande." />
        <Field name="trialEndsOn" label="Fin de la prueba" type="date" state={s} hint="Para extender una prueba." />
      </div>
      <TextareaField name="note" label="Motivo" rows={2} placeholder="Piloto: 6 meses sin cargo" state={s} required />
      <SubmitButton className="sm:w-fit">Guardar cambios</SubmitButton>
    </form>
  );
}
