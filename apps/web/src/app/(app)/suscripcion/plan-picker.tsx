"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { cancelSubscription, startSubscription } from "./actions";

export interface PlanOption {
  code: string;
  name: string;
  contracts: string;
  monthly: string;
  annual: string;
  annualPerMonth: string;
  fits: boolean;
  suggested: boolean;
  current: boolean;
}

export function PlanPicker({ plans, canChoose }: { plans: PlanOption[]; canChoose: boolean }) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [pending, startTransition] = useTransition();

  function choose(code: string) {
    startTransition(async () => {
      // On success the action redirects to the provider's checkout.
      const result = await startSubscription(code, cycle);
      if (result?.message) toast.error(result.message);
    });
  }

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Forma de pago" className="bg-muted inline-flex w-fit rounded-lg p-1 text-sm">
        {(["monthly", "annual"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cycle === c}
            onClick={() => setCycle(c)}
            className={cn("rounded-md px-3 py-1.5", cycle === c && "bg-background shadow-sm")}
          >
            {c === "monthly" ? "Mensual" : "Anual (2 meses gratis)"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.code} className={cn(p.suggested && "border-primary")}>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{p.name}</CardTitle>
              {p.current ? <Badge>Tu plan</Badge> : p.suggested ? <Badge variant="secondary">Recomendado</Badge> : null}
            </CardHeader>
            <CardContent className="grid gap-3">
              <p>
                <span className="text-2xl font-semibold tabular-nums">{cycle === "monthly" ? p.monthly : p.annual}</span>
                <span className="text-muted-foreground text-sm">{cycle === "monthly" ? " por mes" : " por año"}</span>
              </p>
              {cycle === "annual" && <p className="text-muted-foreground -mt-2 text-xs">Equivale a {p.annualPerMonth} por mes</p>}
              <ul className="grid gap-1 text-sm">
                <li className="flex gap-2">
                  <Check className="text-primary size-4" /> {p.contracts}
                </li>
                <li className="flex gap-2">
                  <Check className="text-primary size-4" /> Usuarios ilimitados
                </li>
                <li className="flex gap-2">
                  <Check className="text-primary size-4" /> Todo incluido: índices, recibos, avisos, caja
                </li>
              </ul>
              {canChoose && (
                <Button
                  onClick={() => choose(p.code)}
                  disabled={pending || !p.fits}
                  variant={p.suggested ? "default" : "outline"}
                  aria-label={`Elegir plan ${p.name}`}
                >
                  {!p.fits ? "No alcanza para tus contratos" : p.current ? "Cambiar forma de pago" : "Elegir"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CancelSubscriptionButton() {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" disabled={pending}>
          Cancelar suscripción
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar la suscripción?</AlertDialogTitle>
          <AlertDialogDescription>
            Se detiene el débito automático y la cuenta pasa a solo lectura: vas a poder ver y exportar todo, pero no cargar datos nuevos. No se borra nada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const result = await cancelSubscription();
                if (result.ok) toast.success(result.message);
                else if (result.message) toast.error(result.message);
              })
            }
          >
            Cancelar suscripción
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
