"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import type { FormState } from "@/lib/forms";
import { resetTemplate, saveNoticeSettings, saveTemplate } from "./actions";

export interface NoticeValues {
  paymentReminder: boolean;
  reminderDaysBefore: number;
  lateNotice: boolean;
  lateDays: number[];
  amountUpdate: boolean;
  updateDaysBefore: number;
  contractExpiry: boolean;
  expiryDaysBefore: number[];
}

function Toggle({ name, label, description, defaultChecked }: { name: string; label: string; description: string; defaultChecked: boolean }) {
  const id = `${useId()}-${name}`;
  return (
    <label htmlFor={id} className="flex items-start gap-3">
      <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="accent-primary mt-0.5 size-4" />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}

export function NoticeSettingsForm({ initial }: { initial: NoticeValues }) {
  const [state, action] = useActionState(saveNoticeSettings, {} as FormState);
  const values = {
    reminderDaysBefore: String(initial.reminderDaysBefore),
    lateDays: initial.lateDays.join(", "),
    updateDaysBefore: String(initial.updateDaysBefore),
    expiryDaysBefore: initial.expiryDaysBefore.join(", "),
    ...state.values,
  };
  const checked = (name: keyof NoticeValues) => (state.values ? state.values[name] === "on" : Boolean(initial[name]));
  const s = { ...state, values };
  return (
    <form action={action} className="grid gap-5">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem] sm:items-start">
        <Toggle name="paymentReminder" label="Recordatorio de pago" description="Al inquilino, antes del vencimiento, si la deuda sigue impaga." defaultChecked={checked("paymentReminder")} />
        <Field name="reminderDaysBefore" label="Días antes" type="number" min={1} max={30} state={s} />
        <Toggle name="lateNotice" label="Aviso de mora" description="Al inquilino, cuando la deuda está vencida." defaultChecked={checked("lateNotice")} />
        <Field name="lateDays" label="Días de atraso" placeholder="1, 5, 10" state={s} />
        <Toggle name="amountUpdate" label="Actualización de monto" description="Al inquilino y a los propietarios, cuando se confirma el nuevo monto." defaultChecked={checked("amountUpdate")} />
        <Field name="updateDaysBefore" label="Días antes del mes" type="number" min={1} max={60} state={s} />
        <Toggle name="contractExpiry" label="Vencimiento de contrato" description="A la inmobiliaria (su email, o el de los administradores)." defaultChecked={checked("contractExpiry")} />
        <Field name="expiryDaysBefore" label="Días antes del fin" placeholder="60, 30" state={s} />
      </div>
      <SubmitButton className="sm:w-fit">Guardar avisos</SubmitButton>
    </form>
  );
}

export interface TemplateEditorProps {
  type: string;
  label: string;
  variables: Record<string, string>;
  customized: boolean;
  email: { subject: string; body: string };
  whatsapp: { body: string };
}

export function TemplateDialog(props: TemplateEditorProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveTemplate(props.type as Parameters<typeof saveTemplate>[0], prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success(result.message);
      return {};
    }
    return result;
  }, {} as FormState);
  const s = {
    ...state,
    values: { emailSubject: props.email.subject, emailBody: props.email.body, whatsappBody: props.whatsapp.body, ...state.values },
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Editar ${props.label}`}>
          <Pencil /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.label}</DialogTitle>
          <DialogDescription>
            Variables: {Object.entries({ ...props.variables, INMOBILIARIA: "Nombre de la inmobiliaria" }).map(([name, description], i) => (
              <span key={name}>
                {i > 0 && " · "}
                <code className="text-foreground">{`{{${name}}}`}</code> {description.toLowerCase()}
              </span>
            ))}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field name="emailSubject" label="Asunto del email" state={s} required />
          <TextareaField name="emailBody" label="Email" rows={8} state={s} required />
          <TextareaField name="whatsappBody" label="WhatsApp" rows={4} state={s} required />
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="w-fit">Guardar</SubmitButton>
            {props.customized && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resetTemplate(props.type as Parameters<typeof resetTemplate>[0]);
                    setOpen(false);
                    if (result.message) toast.success(result.message);
                  })
                }
              >
                Volver al original
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
