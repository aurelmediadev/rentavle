"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

interface FieldProps extends Omit<ComponentProps<typeof Input>, "name"> {
  name: string;
  label: string;
  state: FormState;
  hint?: ReactNode;
}

export function Field({ name, label, state, hint, className, ...props }: FieldProps) {
  const errors = state.fieldErrors?.[name];
  const id = `field-${name}`;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={state.values?.[name]}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? `${id}-error` : undefined}
        {...props}
      />
      {hint && !errors && <p className="text-muted-foreground text-xs">{hint}</p>}
      {errors && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={cn("w-full", className)}>
      {pending ? "Procesando…" : children}
    </Button>
  );
}
