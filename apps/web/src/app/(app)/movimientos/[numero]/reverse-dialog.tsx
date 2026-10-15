"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { FormMessage, SubmitButton, TextareaField } from "@/components/form";
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
import { reversePayment } from "../../contratos/[numero]/payment-actions";

export function ReversePaymentDialog({ movementId, kind = "payment" }: { movementId: string; kind?: "payment" | "settlement" }) {
  const noun = kind === "settlement" ? "liquidación" : "cobro";
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await reversePayment(movementId, prev, formData);
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
        <Button variant="outline">
          <Undo2 /> Anular {noun}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular {noun}</DialogTitle>
          <DialogDescription>
            {kind === "settlement"
              ? "Los cobros vuelven a quedar pendientes de liquidar y se anulan los honorarios que generó. La liquidación queda en el historial como anulada."
              : "Las deudas que pagó vuelven a estar pendientes y se anulan los punitorios y el saldo a favor que generó. El cobro queda en el historial como anulado."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <TextareaField name="reason" label="Motivo" rows={2} state={state} required />
          <SubmitButton>Anular {noun}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
