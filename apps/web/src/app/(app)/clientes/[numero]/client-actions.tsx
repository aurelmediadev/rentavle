"use client";

import { useActionState, useTransition } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/forms";
import { addBankAccount, archiveClient, removeBankAccount } from "../actions";

export function ArchiveClientButton({ clientId, archived }: { clientId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!archived && !confirm("¿Archivar este cliente? Deja de aparecer en listados y selectores; no se borra nada.")) return;
        startTransition(() => archiveClient(clientId, !archived));
      }}
    >
      {archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "Restaurar" : "Archivar"}
    </Button>
  );
}

export function RemoveBankAccountButton({ bankAccountId }: { bankAccountId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Quitar cuenta"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Quitar esta cuenta bancaria?")) return;
        startTransition(() => removeBankAccount(bankAccountId));
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function BankAccountForm({ clientId, currencies }: { clientId: string; currencies: string[] }) {
  const [state, action] = useActionState(addBankAccount.bind(null, clientId), initialFormState);
  return (
    <form action={action} key={state.ok ? state.message : undefined} className="grid gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="cbu" label="CBU / CVU" inputMode="numeric" maxLength={22} state={state} />
        <Field name="alias" label="Alias" state={state} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <Field name="bankName" label="Banco" state={state} />
        <Field name="holderName" label="Titular (si no es el cliente)" state={state} />
        <SelectField
          name="currency"
          label="Moneda"
          state={state}
          options={currencies.map((c) => ({ value: c, label: c }))}
          defaultValue={currencies[0]}
        />
      </div>
      <SubmitButton className="w-fit">Agregar cuenta</SubmitButton>
    </form>
  );
}
