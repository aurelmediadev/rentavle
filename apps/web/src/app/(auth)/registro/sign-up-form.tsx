"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/forms";
import { signUp } from "../actions";

export function SignUpForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState(signUp, initialFormState);

  if (state.ok) {
    return (
      <div className="grid gap-4">
        <FormMessage state={state} />
        <p className="text-muted-foreground text-sm">Abrí el link del email para activar tu cuenta y seguir.</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="firstName" label="Nombre" autoComplete="given-name" required state={state} />
        <Field name="lastName" label="Apellido" autoComplete="family-name" required state={state} />
      </div>
      <Field name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        state={state}
        hint="Al menos 8 caracteres."
      />
      <SubmitButton>Crear cuenta</SubmitButton>
      <p className="text-muted-foreground text-center text-sm">
        ¿Ya tenés cuenta?{" "}
        <Link href={next ? `/ingresar?next=${encodeURIComponent(next)}` : "/ingresar"} className="text-foreground underline underline-offset-4">
          Ingresá
        </Link>
      </p>
    </form>
  );
}
