"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialFormState } from "@/lib/forms";
import { createOrganization } from "./actions";

interface CountryOption {
  code: string;
  name: string;
  taxIdLabel: string;
  taxIdPlaceholder: string;
}

export function OrganizationForm({ countries }: { countries: CountryOption[] }) {
  const [state, action] = useActionState(createOrganization, initialFormState);
  const [countryCode, setCountryCode] = useState(state.values?.country ?? countries[0]!.code);
  const country = countries.find((c) => c.code === countryCode) ?? countries[0]!;

  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <Field name="name" label="Nombre de la inmobiliaria" required autoComplete="organization" state={state} />
      <div className="grid gap-2">
        <Label htmlFor="field-country">País</Label>
        <Select name="country" value={countryCode} onValueChange={setCountryCode}>
          <SelectTrigger id="field-country" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">Pronto: Chile y más países de Latinoamérica.</p>
      </div>
      <Field
        name="taxId"
        label={country.taxIdLabel}
        placeholder={country.taxIdPlaceholder}
        inputMode="numeric"
        required
        state={state}
        hint="Una prueba gratis por inmobiliaria."
      />
      <SubmitButton>Empezar</SubmitButton>
    </form>
  );
}
