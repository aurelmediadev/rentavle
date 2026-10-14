"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Mail, Phone, Plus, Trash2 } from "lucide-react";
import { Field, FormMessage, FormSection, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CountryFormOptions } from "@/lib/country";
import { type FormState, initialFormState } from "@/lib/forms";

export interface ContactDraft {
  type: "email" | "phone";
  value: string;
  label: string;
}

interface ClientFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  country: CountryFormOptions;
  defaults?: Record<string, string>;
  contacts?: ContactDraft[];
  submitLabel: string;
  cancelHref: string;
}

export function ClientForm({ action, country, defaults = {}, contacts: initialContacts, submitLabel, cancelHref }: ClientFormProps) {
  const [state, formAction] = useActionState(action, { ...initialFormState, values: defaults });
  const [kind, setKind] = useState(state.values?.kind ?? defaults.kind ?? "person");
  const [contacts, setContacts] = useState<ContactDraft[]>(
    initialContacts?.length
      ? initialContacts
      : [
          { type: "email", value: "", label: "" },
          { type: "phone", value: "", label: "" },
        ],
  );

  const updateContact = (index: number, patch: Partial<ContactDraft>) =>
    setContacts((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />

      <FormSection title="Datos personales">
        <input type="hidden" name="kind" value={kind} />
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(value) => value && setKind(value)}
          className="w-fit"
          aria-label="Tipo de cliente"
        >
          <ToggleGroupItem value="person">Persona</ToggleGroupItem>
          <ToggleGroupItem value="company">Empresa</ToggleGroupItem>
        </ToggleGroup>

        {kind === "person" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="firstName" label="Nombre" required state={state} />
            <Field name="lastName" label="Apellido" required state={state} />
          </div>
        ) : (
          <Field name="companyName" label="Razón social" required state={state} />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="docType"
            label="Tipo de documento"
            state={state}
            options={country.identityDocuments}
            optional
            defaultValue={defaults.docType || country.identityDocuments[0]?.value}
          />
          <Field name="docNumber" label="Número de documento" inputMode="numeric" state={state} />
          <Field name="taxId" label={country.taxIdLabel} placeholder={country.taxIdPlaceholder} inputMode="numeric" state={state} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField name="taxCondition" label="Condición fiscal" state={state} options={country.taxConditions} optional />
          {kind === "person" && (
            <>
              <Field name="nationality" label="Nacionalidad" state={state} />
              <Field name="birthDate" label="Fecha de nacimiento" type="date" state={state} />
            </>
          )}
        </div>
      </FormSection>

      <FormSection title="Contacto" description="El primer email y el primer teléfono se usan para los avisos.">
        <div className="grid gap-3">
          {contacts.map((contact, index) => (
            <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:grid-cols-[auto_1fr_180px_auto]">
              <input type="hidden" name="contactType" value={contact.type} />
              <span className="text-muted-foreground" aria-hidden>
                {contact.type === "email" ? <Mail className="size-4" /> : <Phone className="size-4" />}
              </span>
              <Input
                name="contactValue"
                type={contact.type === "email" ? "email" : "tel"}
                placeholder={contact.type === "email" ? "nombre@ejemplo.com" : `${country.phonePrefix} 11 1234-5678`}
                aria-label={contact.type === "email" ? "Email" : "Teléfono"}
                value={contact.value}
                onChange={(e) => updateContact(index, { value: e.target.value })}
              />
              <Input
                name="contactLabel"
                placeholder="Etiqueta (opcional)"
                aria-label="Etiqueta"
                className="hidden sm:block"
                value={contact.label}
                onChange={(e) => updateContact(index, { label: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar"
                onClick={() => setContacts((list) => list.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {state.fieldErrors?.contacts && <p className="text-destructive text-xs">{state.fieldErrors.contacts[0]}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setContacts((l) => [...l, { type: "email", value: "", label: "" }])}>
              <Plus /> Email
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setContacts((l) => [...l, { type: "phone", value: "", label: "" }])}>
              <Plus /> Teléfono
            </Button>
          </div>
        </div>
      </FormSection>

      <AddressFields state={state} country={country} />

      <FormSection title="Notas">
        <TextareaField name="notes" label="Notas internas" rows={3} state={state} />
      </FormSection>

      <div className="flex gap-2">
        <SubmitButton className="w-auto">{submitLabel}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

export function AddressFields({
  state,
  country,
  title = "Domicilio",
  requireStreet = false,
}: {
  state: FormState;
  country: CountryFormOptions;
  title?: string;
  requireStreet?: boolean;
}) {
  return (
    <FormSection title={title}>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
        <Field name="street" label="Calle" required={requireStreet} autoComplete="address-line1" state={state} />
        <Field name="streetNumber" label="Número" state={state} />
        <Field name="unit" label="Piso / depto" state={state} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="city" label="Localidad / barrio" state={state} />
        <SelectField name="region" label="Provincia" state={state} options={country.regions} optional />
        <Field name="postalCode" label="Código postal" state={state} />
      </div>
    </FormSection>
  );
}
