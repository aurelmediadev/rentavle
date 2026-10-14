"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { type FormState, formValues, safeNextPath, validationError } from "@/lib/forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const email = z.email("Ingresá un email válido").trim().toLowerCase();
const password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres");

const signInSchema = z.object({ email, password: z.string().min(1, "Ingresá tu contraseña") });

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Todavía no confirmaste tu email. Revisá tu casilla."
        : "Email o contraseña incorrectos";
    return { message, values: formValues(formData) };
  }

  redirect(safeNextPath(formData.get("next")));
}

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresá tu nombre"),
  lastName: z.string().trim().min(1, "Ingresá tu apellido"),
  email,
  password,
});

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const next = safeNextPath(formData.get("next"), "/bienvenida");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { first_name: parsed.data.firstName, last_name: parsed.data.lastName },
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    return { message: "No pudimos crear la cuenta. Probá de nuevo.", values: formValues(formData) };
  }

  // Same response whether or not the email was already registered.
  return { ok: true, message: `Te enviamos un email a ${parsed.data.email} para confirmar tu cuenta.` };
}

const resetSchema = z.object({ email });

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/restablecer`,
  });

  return { ok: true, message: "Si el email está registrado, te enviamos un link para crear una contraseña nueva." };
}

const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: "No pudimos actualizar la contraseña. Pedí un link nuevo." };

  redirect("/panel");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/ingresar");
}
