"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type InviteState, inviteMember } from "./actions";

export function InviteForm() {
  const [state, action] = useActionState<InviteState, FormData>(inviteMember, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field name="email" label="Email" type="email" required state={state.ok ? {} : state} />
        <div className="grid gap-2">
          <Label htmlFor="field-role">Rol</Label>
          <Select name="role" defaultValue={state.values?.role ?? "operator"}>
            <SelectTrigger id="field-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="operator">Operador</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <SubmitButton className="sm:w-auto">Invitar</SubmitButton>
      </form>
      <FormMessage state={state} />
      {state.link && (
        <div className="flex gap-2">
          <Input readOnly value={state.link} aria-label="Link de invitación" onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(state.link!);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      )}
    </div>
  );
}
