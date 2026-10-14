"use client";

import { useFormStatus } from "react-dom";
import { useId, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  // Unique per instance: Next.js keeps visited pages mounted, so names repeat in the DOM.
  const id = `${useId()}-${name}`;
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

/** Value used by optional selects for "no value"; Server Actions map it to null. */
export const NONE = "none";

interface SelectFieldProps {
  name: string;
  label: string;
  state: FormState;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  /** Adds a "Sin especificar" option that submits NONE. */
  optional?: boolean;
  required?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}

export function SelectField({
  name,
  label,
  state,
  options,
  defaultValue,
  placeholder = "Elegí una opción",
  optional,
  required,
  className,
  onValueChange,
}: SelectFieldProps) {
  // Unique per instance: Next.js keeps visited pages mounted, so names repeat in the DOM.
  const id = `${useId()}-${name}`;
  const errors = state.fieldErrors?.[name];
  const initial = state.values?.[name] ?? defaultValue ?? (optional ? NONE : undefined);
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select name={name} defaultValue={initial} required={required} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full" aria-invalid={errors ? true : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>Sin especificar</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors && <p className="text-destructive text-xs">{errors[0]}</p>}
    </div>
  );
}

interface TextareaFieldProps extends Omit<ComponentProps<typeof Textarea>, "name"> {
  name: string;
  label: string;
  state: FormState;
}

export function TextareaField({ name, label, state, className, ...props }: TextareaFieldProps) {
  // Unique per instance: Next.js keeps visited pages mounted, so names repeat in the DOM.
  const id = `${useId()}-${name}`;
  const errors = state.fieldErrors?.[name];
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={name} defaultValue={state.values?.[name]} aria-invalid={errors ? true : undefined} {...props} />
      {errors && <p className="text-destructive text-xs">{errors[0]}</p>}
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <div>
        <legend className="font-medium">{title}</legend>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
