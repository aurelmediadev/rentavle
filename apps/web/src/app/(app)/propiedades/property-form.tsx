"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { type ClientOption, ClientPicker } from "@/components/client-picker";
import { Field, FormMessage, FormSection, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CountryFormOptions } from "@/lib/country";
import { type FormState, initialFormState } from "@/lib/forms";
import { AddressFields } from "../clientes/client-form";
import { PROPERTY_STATUS_OPTIONS, PROPERTY_TYPE_OPTIONS } from "./labels";

export interface OwnerDraft {
  clientId: string | null;
  pct: string;
}

interface PropertyFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  country: CountryFormOptions;
  clients: ClientOption[];
  defaults?: Record<string, string>;
  owners?: OwnerDraft[];
  submitLabel: string;
  cancelHref: string;
}

/** Splits 100% evenly with two decimals; the first owner absorbs the rounding. */
function evenSplit(count: number): string[] {
  const base = Math.floor(10000 / count) / 100;
  const first = Math.round((100 - base * (count - 1)) * 100) / 100;
  return Array.from({ length: count }, (_, i) => String(i === 0 ? first : base));
}

export function PropertyForm({ action, country, clients, defaults = {}, owners: initialOwners, submitLabel, cancelHref }: PropertyFormProps) {
  const [state, formAction] = useActionState(action, { ...initialFormState, values: defaults });
  const [owners, setOwners] = useState<OwnerDraft[]>(initialOwners?.length ? initialOwners : [{ clientId: null, pct: "100" }]);

  const setOwner = (index: number, patch: Partial<OwnerDraft>) =>
    setOwners((list) => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  const resize = (next: OwnerDraft[]) => {
    const pcts = evenSplit(next.length);
    setOwners(next.map((o, i) => ({ ...o, pct: pcts[i]! })));
  };

  const total = owners.reduce((acc, o) => acc + (Number(o.pct.replace(",", ".")) || 0), 0);

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />

      <FormSection title="Propietarios" description="Si hay varios dueños, indicá el porcentaje de cada uno: las liquidaciones se dividen así.">
        <div className="grid gap-3">
          {owners.map((owner, index) => (
            <div key={index} className="grid grid-cols-[1fr_96px_auto] items-center gap-2">
              <input type="hidden" name="ownerId" value={owner.clientId ?? ""} />
              <ClientPicker
                clients={clients}
                value={owner.clientId}
                onChange={(clientId) => setOwner(index, { clientId })}
                exclude={owners.map((o) => o.clientId).filter((id): id is string => Boolean(id))}
                placeholder="Elegí el propietario"
                ariaLabel={`Propietario ${index + 1}`}
                newClientHref="/clientes/nuevo"
              />
              <div className="relative">
                <Input
                  name="ownerPct"
                  inputMode="decimal"
                  aria-label={`Porcentaje del propietario ${index + 1}`}
                  value={owner.pct}
                  onChange={(e) => setOwner(index, { pct: e.target.value })}
                  className="pr-6 text-right"
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm">%</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar propietario"
                disabled={owners.length === 1}
                onClick={() => resize(owners.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => resize([...owners, { clientId: null, pct: "0" }])}>
              <Plus /> Copropietario
            </Button>
            <span className={total === 100 ? "text-muted-foreground text-sm" : "text-destructive text-sm"}>
              Total: {Math.round(total * 100) / 100}%
            </span>
          </div>
          {state.fieldErrors?.owners && <p className="text-destructive text-xs">{state.fieldErrors.owners[0]}</p>}
          {clients.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Todavía no hay clientes.{" "}
              <Link href="/clientes/nuevo" className="text-foreground underline underline-offset-4">
                Cargá el propietario primero
              </Link>
              .
            </p>
          )}
        </div>
      </FormSection>

      <FormSection title="Propiedad">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="type" label="Tipo" state={state} options={PROPERTY_TYPE_OPTIONS} defaultValue="apartment" />
          <SelectField name="status" label="Estado" state={state} options={PROPERTY_STATUS_OPTIONS} defaultValue="available" />
        </div>
      </FormSection>

      <AddressFields state={state} country={country} title="Dirección" requireStreet />

      <FormSection title="Otros datos">
        <Field name="cadastralId" label="Nomenclatura catastral" state={state} />
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
