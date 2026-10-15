"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, initialFormState } from "@/lib/forms";
import { emailDocument, whatsappDocument } from "./document-actions";

/** Serializable version of DocumentDraft (lib/communications). */
export interface Draft {
  documentId: string;
  recipient: { name: string; emails: string[]; phones: { value: string; whatsapp: string | null }[] } | null;
  email: { subject: string; body: string };
  whatsapp: { body: string };
}

const LINK_HINT = "{{LINK}} se reemplaza por el link al PDF (vale 30 días).";

export function EmailDocumentDialog({ draft }: { draft: Draft }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await emailDocument(draft.documentId, prev, formData);
    if (result.ok) {
      setOpen(false);
      toast.success(result.message);
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const emails = draft.recipient?.emails ?? [];
  const values = { subject: draft.email.subject, body: draft.email.body, ...state.values };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail /> Enviar por email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar por email</DialogTitle>
          <DialogDescription>Va con el PDF adjunto. Si la inmobiliaria tiene email, recibe una copia oculta.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Para</legend>
            {emails.map((email, i) => (
              <label key={email} htmlFor={`${id}-to-${i}`} className="flex items-center gap-2 text-sm">
                <input id={`${id}-to-${i}`} type="checkbox" name="to" value={email} defaultChecked className="accent-primary size-4" />
                {draft.recipient?.name} &lt;{email}&gt;
              </label>
            ))}
            {emails.length === 0 && (
              <p className="text-muted-foreground text-sm">
                {draft.recipient ? `${draft.recipient.name} no tiene email cargado.` : "Sin destinatario."} Escribilo abajo.
              </p>
            )}
          </fieldset>
          <Field name="extra" label={emails.length ? "Otros emails (opcional)" : "Email"} placeholder="nombre@ejemplo.com" state={state} />
          <Field name="subject" label="Asunto" state={{ ...state, values }} required />
          <TextareaField name="body" label="Mensaje" rows={9} state={{ ...state, values }} required />
          <p className="text-muted-foreground -mt-2 text-xs">{LINK_HINT}</p>
          <SubmitButton>Enviar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsappDocumentDialog({ draft }: { draft: Draft }) {
  const phones = (draft.recipient?.phones ?? []).filter((p) => p.whatsapp);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(phones[0]?.value ?? "");
  const [body, setBody] = useState(draft.whatsapp.body);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function send() {
    // Open the window now (user gesture) so the browser doesn't block it.
    const target = window.open("", "_blank");
    startTransition(async () => {
      const result = await whatsappDocument(draft.documentId, phone, body);
      if (!result.ok) {
        target?.close();
        toast.error(result.message);
        return;
      }
      if (target) target.location.href = result.url;
      else window.location.href = result.url;
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageCircle /> WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar por WhatsApp</DialogTitle>
          <DialogDescription>Se abre WhatsApp con el mensaje listo; lo enviás desde ahí. Queda registrado en el historial.</DialogDescription>
        </DialogHeader>
        {phones.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {draft.recipient ? `${draft.recipient.name} no tiene un celular cargado` : "No hay destinatario"}. Agregalo en la ficha del cliente (con código de área).
          </p>
        ) : (
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Celular</legend>
              {phones.map((p, i) => (
                <label key={p.value} htmlFor={`${id}-phone-${i}`} className="flex items-center gap-2 text-sm">
                  <input
                    id={`${id}-phone-${i}`}
                    type="radio"
                    name="phone"
                    checked={phone === p.value}
                    onChange={() => setPhone(p.value)}
                    className="accent-primary size-4"
                  />
                  {p.value} <span className="text-muted-foreground">(+{p.whatsapp})</span>
                </label>
              ))}
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-body`}>Mensaje</Label>
              <Textarea id={`${id}-body`} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="text-muted-foreground text-xs">{LINK_HINT}</p>
            </div>
            <Button onClick={send} disabled={pending}>
              {pending ? "Abriendo…" : "Abrir WhatsApp"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
