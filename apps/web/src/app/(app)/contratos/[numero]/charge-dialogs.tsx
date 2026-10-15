"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, CalendarPlus, Check, Plus, Repeat, Trash2 } from "lucide-react";
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
import {
  addOneOffCharge,
  addRecurringCharge,
  archiveRecurringCharge,
  confirmChargeAmount,
  generateNextMonth,
  voidCharge,
} from "./charges-actions";

const DEBTORS = [
  { value: "tenant", label: "Inquilino" },
  { value: "owner", label: "Propietario" },
];
const CREDITORS = [
  { value: "owner", label: "Propietario" },
  { value: "administration", label: "Administración" },
  { value: "tenant", label: "Inquilino" },
  { value: "third_party", label: "Un tercero (consorcio, empresa de servicios…)" },
];

/** Dialog whose form closes and toasts on success. */
function useDialogAction(
  run: (prev: FormState, formData: FormData) => Promise<FormState>,
): [boolean, (open: boolean) => void, FormState, (formData: FormData) => void] {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await run(prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success(result.message);
      return initialFormState;
    }
    return result;
  }, initialFormState);
  return [open, setOpen, state, action];
}

export function OneOffChargeDialog({ contractId, currentMonth }: { contractId: string; currentMonth: string }) {
  const [open, setOpen, state, action] = useDialogAction((prev, fd) => addOneOffCharge(contractId, prev, fd));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Cargo o descuento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargo o descuento único</DialogTitle>
          <DialogDescription>Por ejemplo, una reparación a cargo del inquilino o una bonificación.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="kind"
              label="Tipo"
              state={state}
              options={[
                { value: "charge", label: "Cargo (suma a la deuda)" },
                { value: "discount", label: "Descuento (resta)" },
              ]}
              defaultValue="charge"
            />
            <Field name="month" label="Mes" type="month" defaultValue={currentMonth} state={{ ...state, values: undefined }} required />
          </div>
          <Field name="title" label="Concepto" placeholder="Reparación de canilla" state={state} required />
          <Field name="amount" label="Monto" inputMode="decimal" state={state} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="debtor" label="A cargo de" state={state} options={DEBTORS} defaultValue="tenant" />
            <SelectField name="creditor" label="A favor de" state={state} options={CREDITORS} defaultValue="owner" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="appliesFee" className="accent-primary size-4" />
            Lleva honorarios de la administración
          </label>
          <TextareaField name="notes" label="Notas (opcional)" rows={2} state={state} />
          <SubmitButton>Agregar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringChargeDialog({ contractId, currentMonth }: { contractId: string; currentMonth: string }) {
  const [open, setOpen, state, action] = useDialogAction((prev, fd) => addRecurringCharge(contractId, prev, fd));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Repeat /> Gasto recurrente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gasto recurrente</DialogTitle>
          <DialogDescription>Se genera solo cada período: expensas, ABL, servicios, seguros.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field name="title" label="Nombre" placeholder="Expensas" state={state} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="amount" label="Monto" inputMode="decimal" state={state} required />
            <SelectField
              name="frequencyMonths"
              label="Frecuencia"
              state={state}
              options={[
                { value: "1", label: "Mensual" },
                { value: "2", label: "Bimestral" },
                { value: "3", label: "Trimestral" },
                { value: "6", label: "Semestral" },
                { value: "12", label: "Anual" },
              ]}
              defaultValue="1"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="startMonth" label="Primer mes" type="month" defaultValue={currentMonth} state={{ ...state, values: undefined }} required />
            <Field name="endMonth" label="Último mes (opcional)" type="month" state={state} hint="Vacío: hasta el fin del contrato." />
          </div>
          <SelectField
            name="timing"
            label="Se cobra"
            state={state}
            options={[
              { value: "in_advance", label: "En el mismo mes (por adelantado)" },
              { value: "in_arrears", label: "El mes siguiente, cuando llega la factura (vencido)" },
            ]}
            defaultValue="in_advance"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="debtor" label="A cargo de" state={state} options={DEBTORS} defaultValue="tenant" />
            <SelectField name="creditor" label="A favor de" state={state} options={CREDITORS} defaultValue="administration" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresConfirmation" defaultChecked className="accent-primary size-4" />
            El monto varía: generarlo como estimado para confirmarlo cada mes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="appliesFee" className="accent-primary size-4" />
            Lleva honorarios de la administración
          </label>
          <SubmitButton>Agregar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmAmountDialog({ chargeId, title, amount }: { chargeId: string; title: string; amount: string }) {
  const [open, setOpen, state, action] = useDialogAction((prev, fd) => confirmChargeAmount(chargeId, prev, fd));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Confirmar monto de ${title}`}>
          <Check />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar monto · {title}</DialogTitle>
          <DialogDescription>Cargá el importe real (por ejemplo, el de la factura de expensas).</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field
            name="amount"
            label="Monto"
            inputMode="decimal"
            defaultValue={state.values?.amount ?? amount.replace(/\.00$/, "")}
            state={{ ...state, values: undefined }}
            required
          />
          <SubmitButton>Confirmar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VoidChargeDialog({ chargeId, title }: { chargeId: string; title: string }) {
  const [open, setOpen, state, action] = useDialogAction((prev, fd) => voidCharge(chargeId, prev, fd));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Anular ${title}`}>
          <Ban />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular · {title}</DialogTitle>
          <DialogDescription>La deuda queda en el historial como anulada y deja de sumar al saldo.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <TextareaField name="reason" label="Motivo" rows={2} state={state} required />
          <SubmitButton>Anular deuda</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveRecurringButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Quitar ${title}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Dejar de generar "${title}"? Las deudas ya generadas no cambian.`)) return;
        startTransition(() => archiveRecurringCharge(id));
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function GenerateNextMonthButton({ contractId }: { contractId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const created = await generateNextMonth(contractId);
          toast.success(created ? `${created} deudas del próximo mes generadas` : "Las deudas del próximo mes ya estaban generadas");
        })
      }
    >
      <CalendarPlus /> Deudas del próximo mes
    </Button>
  );
}
