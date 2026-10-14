"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/forms";
import { signIn } from "../actions";

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const linkError = searchParams.get("error") === "link";
  const [state, action] = useActionState(signIn, initialFormState);

  return (
    <form action={action} className="grid gap-4">
      {linkError && !state.message && (
        <FormMessage state={{ message: "El link no es válido o venció. Pedí uno nuevo." }} />
      )}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <Field name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        state={state}
        hint={
          <Link href="/recuperar" className="underline underline-offset-4">
            ¿Olvidaste tu contraseña?
          </Link>
        }
      />
      <SubmitButton>Ingresar</SubmitButton>
      <p className="text-muted-foreground text-center text-sm">
        ¿No tenés cuenta?{" "}
        <Link href={next ? `/registro?next=${encodeURIComponent(next)}` : "/registro"} className="text-foreground underline underline-offset-4">
          Probá Rentavle gratis
        </Link>
      </p>
    </form>
  );
}
