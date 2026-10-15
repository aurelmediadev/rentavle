import Link from "next/link";
import { CheckCircle2, Circle, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSampleAgency, deleteSampleAgency, dismissOnboarding } from "../actions";
import type { onboardingState } from "./data";

type State = Awaited<ReturnType<typeof onboardingState>>;

/** Checklist of first steps, with the option to try everything on a sample agency first. */
export function OnboardingCard({ state }: { state: State }) {
  const total = state.steps.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Primeros pasos</CardTitle>
        <CardDescription>
          {state.done} de {total} listos. Con esto ya podés cobrar, liquidar y mandar recibos.
        </CardDescription>
        <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-primary h-full" style={{ width: `${Math.round((state.done / total) * 100)}%` }} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid gap-2">
          {state.steps.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="hover:bg-muted/50 flex gap-3 rounded-lg border p-3"
                aria-label={`${s.title}${s.done ? " (listo)" : ""}`}
              >
                {s.done ? <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" /> : <Circle className="text-muted-foreground mt-0.5 size-5 shrink-0" />}
                <span>
                  <span className={s.done ? "text-muted-foreground font-medium line-through" : "font-medium"}>{s.title}</span>
                  <span className="text-muted-foreground block text-sm">{s.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {state.isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {!state.hasSample && (
              <form action={createSampleAgency}>
                <Button type="submit" variant="outline">
                  <FlaskConical /> Probar con datos de ejemplo
                </Button>
              </form>
            )}
            <form action={dismissOnboarding}>
              <Button type="submit" variant="ghost">
                Ocultar
              </Button>
            </form>
          </div>
        )}
        {state.isAdmin && !state.hasSample && (
          <p className="text-muted-foreground text-xs">
            Los datos de ejemplo van a una inmobiliaria aparte, para probar sin ensuciar la tuya. Se borra cuando quieras.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Shown while working in the sample agency. */
export function SampleBanner({ parentName, isAdmin }: { parentName: string | null; isAdmin: boolean }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
      <p className="text-sm">
        <strong>Inmobiliaria de ejemplo.</strong> Probá todo lo que quieras: estos datos son inventados y no se mezclan con los de{" "}
        {parentName ?? "tu inmobiliaria"}. Para volver, usá el selector de inmobiliaria arriba a la izquierda.
      </p>
      {isAdmin && (
        <form action={deleteSampleAgency}>
          <Button type="submit" variant="outline" size="sm">
            Borrar la inmobiliaria de ejemplo
          </Button>
        </form>
      )}
    </div>
  );
}
