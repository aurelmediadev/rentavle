"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, CalendarX, CheckCircle2, RefreshCw, RotateCcw, Undo2 } from "lucide-react";
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
import { type FormState, initialFormState } from "@/lib/forms";
import { cancelContractTermination, changeContractEndDate, finishContract } from "../actions";

interface ContractActionsProps {
  contractId: string;
  number: number;
  status: "active" | "finished" | "renewed";
  endDate: string;
  hasTermination: boolean;
}

export function ContractActions({ contractId, number, status, endDate, hasTermination }: ContractActionsProps) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else toast.success(success);
    });

  if (status === "renewed") return null;
  if (status === "finished") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => finishContract(contractId, false), "Contrato reabierto")}>
        <RotateCcw /> Reabrir
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <EndDateDialog
        contractId={contractId}
        kind="extend"
        currentEnd={endDate}
        trigger={
          <Button variant="outline">
            <CalendarPlus /> Prorrogar
          </Button>
        }
      />
      {hasTermination ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Anular la rescisión y volver a la fecha de fin original?")) return;
            run(() => cancelContractTermination(contractId), "Rescisión anulada");
          }}
        >
          <Undo2 /> Anular rescisión
        </Button>
      ) : (
        <EndDateDialog
          contractId={contractId}
          kind="terminate"
          currentEnd={endDate}
          trigger={
            <Button variant="outline">
              <CalendarX /> Rescindir
            </Button>
          }
        />
      )}
      <Button asChild variant="outline">
        <Link href={`/contratos/nuevo?renovar=${number}`}>
          <RefreshCw /> Renovar
        </Link>
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Marcar el contrato como finalizado? Deja de generar deudas.")) return;
          run(() => finishContract(contractId, true), "Contrato finalizado");
        }}
      >
        <CheckCircle2 /> Finalizar
      </Button>
    </div>
  );
}

function EndDateDialog({
  contractId,
  kind,
  currentEnd,
  trigger,
}: {
  contractId: string;
  kind: "extend" | "terminate";
  currentEnd: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await changeContractEndDate(contractId, kind, prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success(result.message);
    }
    return result.ok ? initialFormState : result;
  }, initialFormState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "extend" ? "Prorrogar contrato" : "Rescisión anticipada"}</DialogTitle>
          <DialogDescription>
            {kind === "extend"
              ? "Extiende el contrato con las mismas condiciones. Se agregan los períodos de actualización que correspondan."
              : "El contrato termina antes de lo pactado. Se quitan los períodos posteriores a la nueva fecha."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field
            name="endDate"
            label={kind === "extend" ? "Nueva fecha de fin" : "Fecha de fin (rescisión)"}
            type="date"
            required
            min={kind === "extend" ? currentEnd : undefined}
            max={kind === "terminate" ? currentEnd : undefined}
            state={state}
          />
          <TextareaField name="reason" label="Motivo (opcional)" rows={2} state={state} />
          <SubmitButton>{kind === "extend" ? "Prorrogar" : "Registrar rescisión"}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
