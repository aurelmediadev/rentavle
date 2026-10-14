"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initialFormState } from "@/lib/forms";
import { requestPasswordReset } from "../actions";

export default function RecoverPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>Te enviamos un link para crear una nueva.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage state={state} />
          {!state.ok && (
            <>
              <Field name="email" label="Email" type="email" autoComplete="email" required state={state} />
              <SubmitButton>Enviar link</SubmitButton>
            </>
          )}
          <Link href="/ingresar" className="text-muted-foreground text-center text-sm underline underline-offset-4">
            Volver a ingresar
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
