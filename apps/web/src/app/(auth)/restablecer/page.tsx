"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initialFormState } from "@/lib/forms";
import { updatePassword } from "../actions";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva contraseña</CardTitle>
        <CardDescription>Elegí una contraseña de al menos 8 caracteres.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          <Field name="password" label="Contraseña nueva" type="password" autoComplete="new-password" minLength={8} required state={state} />
          <Field name="confirm" label="Repetila" type="password" autoComplete="new-password" required state={state} />
          <SubmitButton>Guardar contraseña</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
