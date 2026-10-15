"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/forms";
import { removeBrandingImage, updateAgency, uploadBrandingImage } from "./actions";

export function AgencyForm({
  initial,
  taxIdLabel,
  taxIdPlaceholder,
  taxConditions,
}: {
  initial: Record<string, string>;
  taxIdLabel: string;
  taxIdPlaceholder: string;
  taxConditions: { value: string; label: string }[];
}) {
  const [state, action] = useActionState(updateAgency, { values: initial } as FormState);
  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nombre comercial" state={state} required />
        <Field name="legalName" label="Razón social" state={state} hint="Firma los recibos." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="taxId" label={taxIdLabel} placeholder={taxIdPlaceholder} state={state} />
        <SelectField name="taxCondition" label="Condición fiscal" state={state} options={taxConditions} optional />
      </div>
      <Field name="address" label="Domicilio" placeholder="Av. Corrientes 1234, CABA" state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="phone" label="Teléfono" state={state} />
        <Field name="email" label="Email" type="email" state={state} />
      </div>
      <SubmitButton className="sm:w-fit">Guardar</SubmitButton>
    </form>
  );
}

export function BrandingImageForm({ kind, url }: { kind: "logo" | "signature"; url: string | null }) {
  const label = kind === "logo" ? "Logo" : "Firma";
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await uploadBrandingImage(kind, prev, formData);
    if (result.ok) {
      toast.success(result.message);
      return {};
    }
    return result;
  }, {} as FormState);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3">
      <div className="bg-muted/40 flex h-24 items-center justify-center rounded-md border">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image served by Storage
          <img src={url} alt={label} className="max-h-20 max-w-[80%] object-contain" />
        ) : (
          <span className="text-muted-foreground text-sm">Sin {label.toLowerCase()}</span>
        )}
      </div>
      <form action={action} className="grid gap-2">
        <FormMessage state={state} />
        <Input type="file" name="file" accept="image/png,image/jpeg" aria-label={`Archivo de ${label.toLowerCase()}`} required />
        <div className="flex gap-2">
          <SubmitButton className="w-fit">Subir {label.toLowerCase()}</SubmitButton>
          {url && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeBrandingImage(kind);
                  if (result.message) toast.success(result.message);
                })
              }
            >
              Quitar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
