"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, ArrowLeftRight, Minus, Plus } from "lucide-react";
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
import { archiveCashAccountAction, createCashAccountAction, createManualMovement } from "./actions";

export interface BoxOption {
  id: string;
  name: string;
  currency: string;
}

const KINDS = {
  manual_income: {
    trigger: "Ingreso",
    icon: Plus,
    title: "Ingreso de dinero",
    description: "Dinero que entra a la administración y no es un cobro de alquiler: una venta, un reintegro, un aporte.",
    box: "Caja o cuenta",
    placeholder: "Reintegro de gastos bancarios",
  },
  manual_expense: {
    trigger: "Egreso",
    icon: Minus,
    title: "Egreso de dinero",
    description: "Gastos de la administración: librería, servicios, sueldos, pago a un proveedor.",
    box: "Caja o cuenta",
    placeholder: "Compra de librería",
  },
  transfer: {
    trigger: "Transferencia",
    icon: ArrowLeftRight,
    title: "Transferencia entre cajas",
    description: "Pasar dinero de una caja a otra: un depósito en el banco, una extracción.",
    box: "Desde",
    placeholder: "Depósito en el banco",
  },
} as const;

export function ManualMovementDialog({
  kind,
  boxes,
  today,
}: {
  kind: keyof typeof KINDS;
  boxes: BoxOption[];
  today: string;
}) {
  const copy = KINDS[kind];
  const Icon = copy.icon;
  const [state, action] = useActionState(createManualMovement, initialFormState);
  const options = boxes.map((b) => ({ value: b.id, label: `${b.name} (${b.currency})` }));
  const disabled = kind === "transfer" && boxes.length < 2;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} title={disabled ? "Necesitás al menos dos cajas" : undefined}>
          <Icon /> {copy.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <input type="hidden" name="type" value={kind} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="date" label="Fecha" type="date" defaultValue={today} state={state} required />
            <Field name="amount" label="Monto" inputMode="decimal" state={state} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="cashAccountId" label={copy.box} state={state} options={options} defaultValue={boxes[0]?.id} required />
            {kind === "transfer" && (
              <SelectField name="toCashAccountId" label="Hacia" state={state} options={options} defaultValue={boxes[1]?.id} required />
            )}
          </div>
          <TextareaField name="notes" label="Concepto" rows={2} placeholder={copy.placeholder} state={state} required />
          <SubmitButton>Registrar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CashAccountDialog({ defaultCurrency }: { defaultCurrency: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await createCashAccountAction(prev, formData);
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
        <Button>
          <Plus /> Nueva caja o cuenta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva caja o cuenta</DialogTitle>
          <DialogDescription>Una caja de efectivo o una cuenta bancaria de la administración.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field name="name" label="Nombre" placeholder="Banco Galicia cuenta corriente" state={state} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="type"
              label="Tipo"
              state={state}
              options={[
                { value: "cash", label: "Caja de efectivo" },
                { value: "bank", label: "Cuenta bancaria" },
              ]}
              defaultValue="bank"
            />
            <SelectField
              name="currency"
              label="Moneda"
              state={state}
              options={[
                { value: defaultCurrency, label: defaultCurrency },
                ...(defaultCurrency === "USD" ? [] : [{ value: "USD", label: "USD" }]),
              ]}
              defaultValue={defaultCurrency}
            />
          </div>
          <SubmitButton>Crear</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveCashAccountButton({ cashAccountId }: { cashAccountId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveCashAccountAction(cashAccountId);
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <Archive /> Archivar
    </Button>
  );
}
