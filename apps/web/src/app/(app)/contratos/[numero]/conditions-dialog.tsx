"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { Field, FormMessage, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type FormState, initialFormState } from "@/lib/forms";
import { editContractConditions } from "../actions";
import { COLLECTION_METHOD_OPTIONS, FEE_TYPE_OPTIONS, LATE_INTEREST_FROM_OPTIONS } from "../labels";

export interface ConditionValues {
  feeType: string;
  feeValue: string;
  feesOnLateInterest: boolean;
  lateInterestDailyPct: string;
  dueDay: string;
  lateInterestFrom: string;
  collectionMethod: string;
  notes: string;
}

/** Edit fees, late interest, due day and collection method. */
export function ConditionsDialog({ contractId, values }: { contractId: string; values: ConditionValues }) {
  const [open, setOpen] = useState(false);
  const initial: Record<string, string> = { ...values, feesOnLateInterest: values.feesOnLateInterest ? "on" : "" };
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await editContractConditions(contractId, prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success(result.message);
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const s = { ...state, values: { ...initial, ...state.values } };
  const [feeType, setFeeType] = useState(values.feeType);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Editar condiciones
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar condiciones</DialogTitle>
          <DialogDescription>
            Los honorarios y punitorios se usan en los próximos cobros y liquidaciones (también de deudas ya generadas que sigan impagas). El día de vencimiento aplica a las deudas nuevas. El monto y las actualizaciones no se cambian acá.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <SelectField name="feeType" label="Honorarios" state={s} options={FEE_TYPE_OPTIONS} onValueChange={setFeeType} />
            <Field name="feeValue" label={feeType === "pct" ? "Porcentaje sobre lo cobrado" : "Monto fijo mensual"} inputMode="decimal" required state={s} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="lateInterestDailyPct" label="Punitorio diario (%)" inputMode="decimal" state={s} />
            <Field name="dueDay" label="Día de vencimiento" type="number" min={1} max={28} state={s} />
            <SelectField name="lateInterestFrom" label="Los punitorios corren" state={s} options={LATE_INTEREST_FROM_OPTIONS} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="feesOnLateInterest" defaultChecked={s.values.feesOnLateInterest === "on"} className="accent-primary size-4" />
            Cobrar honorarios también sobre los punitorios
          </label>
          <SelectField name="collectionMethod" label="Forma de cobro habitual" state={s} options={COLLECTION_METHOD_OPTIONS} />
          <TextareaField name="notes" label="Notas internas" rows={3} state={s} />
          <TextareaField name="reason" label="Motivo del cambio" rows={2} placeholder="Acuerdo con el propietario por nota del 15/10" state={s} required />
          <SubmitButton>Guardar cambios</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
