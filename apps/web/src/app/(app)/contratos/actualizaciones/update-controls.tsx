"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, RefreshCw } from "lucide-react";
import { Field, FormMessage, SubmitButton, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type FormState, initialFormState } from "@/lib/forms";
import { adjustPeriodAmount, recalculateUpdates, setIpcMode } from "./actions";

export function RecalculateButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await recalculateUpdates();
          toast.success(
            result.calculated
              ? `${result.calculated} ${result.calculated === 1 ? "aumento calculado" : "aumentos calculados"}`
              : "No hay aumentos nuevos para calcular",
            { description: result.waiting ? `${result.waiting} esperando la publicación del índice` : undefined },
          );
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      Recalcular
    </Button>
  );
}

export function AdjustPeriodDialog({
  periodId,
  label,
  currentAmount,
}: {
  periodId: string;
  label: string;
  currentAmount: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await adjustPeriodAmount(periodId, prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success(result.message);
      return initialFormState;
    }
    return result;
  }, initialFormState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Ajustar monto del ${label}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar monto · {label}</DialogTitle>
          <DialogDescription>
            Por ejemplo, si las partes acordaron otro monto. El cálculo automático no vuelve a modificar este período.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field
            name="amount"
            label="Nuevo monto"
            inputMode="decimal"
            defaultValue={state.values?.amount ?? currentAmount?.replace(/\.00$/, "") ?? ""}
            state={{ ...state, values: undefined }}
            required
          />
          <TextareaField name="reason" label="Motivo" rows={2} state={state} required />
          <SubmitButton>Guardar monto</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IpcModeSelect({ value, disabled }: { value: "real" | "provisional"; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={value}
      disabled={disabled || pending}
      onValueChange={(mode) =>
        startTransition(async () => {
          await setIpcMode(mode);
          toast.success("Método de cálculo actualizado");
        })
      }
    >
      <SelectTrigger className="w-full sm:w-96" aria-label="Método de cálculo del IPC">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="real">Solo valores publicados (IPC de hace dos meses)</SelectItem>
        <SelectItem value="provisional">Último mes provisorio (estimado y luego corregido)</SelectItem>
      </SelectContent>
    </Select>
  );
}
