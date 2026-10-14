import type { z } from "zod";

/** Result returned by Server Actions used with useActionState. */
export interface FormState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echo of submitted values so the form keeps them after an error. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION") && !key.toLowerCase().includes("password")) {
      values[key] = value;
    }
  }
  return values;
}

export function validationError(error: z.ZodError, formData: FormData): FormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { fieldErrors, values: formValues(formData) };
}

/** Only same-site relative paths, to avoid open redirects. */
export function safeNextPath(value: unknown, fallback = "/panel"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
