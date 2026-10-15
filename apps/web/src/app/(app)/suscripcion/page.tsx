import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Decimal from "decimal.js";
import { Download } from "lucide-react";
import { suggestedPlan, subscriptionAmount } from "@rentavle/domain";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/numbers";
import { getSubscriptionState } from "@/lib/subscription";
import { CancelSubscriptionButton, PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Suscripción · Rentavle" };

export default function SubscriptionPage({ searchParams }: PageProps<"/suscripcion">) {
  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader title="Suscripción" description="Planes por cantidad de contratos activos, con usuarios ilimitados. Se paga con débito automático de MercadoPago." />
      <Suspense fallback={<PageLoading />}>
        <Subscription searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const STATUS_TEXT = {
  trial: "Prueba gratis",
  active: "Activa",
  past_due: "Pago pendiente",
  read_only: "Solo lectura",
} as const;

async function Subscription({ searchParams }: Pick<PageProps<"/suscripcion">, "searchParams">) {
  const [{ volver }, { role }, state] = await Promise.all([searchParams, getActiveMembership(), getSubscriptionState()]);
  const { access, plan, plans, activeContracts, limit, latest, org } = state;
  const isAdmin = role === "admin";
  const suggestion = suggestedPlan(plans, activeContracts);
  const usage = limit ? Math.min(100, Math.round((activeContracts / limit) * 100)) : null;

  const options = plans.map((p) => {
    const blocks = p.extraBlockContracts && activeContracts > p.maxActiveContracts ? Math.ceil((activeContracts - p.maxActiveContracts) / p.extraBlockContracts) : 0;
    const annual = subscriptionAmount(p, "annual", blocks);
    return {
      code: p.code,
      name: p.name,
      contracts: p.extraBlockContracts
        ? `Hasta ${p.maxActiveContracts + blocks * p.extraBlockContracts} contratos activos (+${p.extraBlockContracts} por ${formatMoney(p.extraBlockPrice!, p.currency)})`
        : `Hasta ${p.maxActiveContracts} contratos activos`,
      monthly: formatMoney(subscriptionAmount(p, "monthly", blocks), p.currency),
      annual: formatMoney(annual, p.currency),
      annualPerMonth: formatMoney(new Decimal(annual).dividedBy(12).toDecimalPlaces(0).toFixed(0), p.currency),
      fits: p.maxActiveContracts >= activeContracts || Boolean(p.extraBlockContracts),
      suggested: suggestion?.plan.code === p.code && !plan,
      current: plan?.code === p.code && access.kind !== "read_only",
    };
  });

  return (
    <>
      {volver && latest?.status === "pending" && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm">
          Estamos esperando la confirmación de MercadoPago. Puede demorar unos minutos; recargá la página.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {plan && access.kind !== "read_only" ? `Plan ${plan.name}` : access.kind === "trial" ? "Prueba gratis" : "Sin plan"}
            <Badge variant={access.writable ? "secondary" : "destructive"}>{STATUS_TEXT[access.kind]}</Badge>
          </CardTitle>
          <CardDescription>
            {access.kind === "trial" && `Te ${access.daysLeft === 1 ? "queda 1 día" : `quedan ${access.daysLeft} días`} (hasta el ${formatDate(org.trialEndsAt!.toISOString())}). Al terminar, la cuenta pasa a solo lectura hasta que elijas un plan; no se borra nada.`}
            {access.kind === "active" && latest?.nextPaymentDate && `Próximo débito: ${formatDate(latest.nextPaymentDate.toISOString())} · ${formatMoney(latest.amount, latest.currency)}.`}
            {access.kind === "active" && !latest && "Acceso sin cargo (inmobiliaria piloto)."}
            {access.kind === "past_due" && "MercadoPago no pudo cobrar y lo va a reintentar. Revisá tu medio de pago en MercadoPago."}
            {access.kind === "read_only" && "Podés ver y exportar todo, pero no cargar datos nuevos. Elegí un plan para seguir."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <p className="text-sm" aria-label="Uso del plan">
              {activeContracts} {limit ? `de ${limit}` : ""} contratos activos
            </p>
            {usage !== null && (
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div className={usage >= 90 ? "bg-destructive h-full" : "bg-primary h-full"} style={{ width: `${usage}%` }} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && latest?.status === "pending" && latest.checkoutUrl && (
              <Button asChild>
                <a href={latest.checkoutUrl}>Continuar el pago en MercadoPago</a>
              </Button>
            )}
            {isAdmin && (
              <Button asChild variant="outline">
                <a href="/api/exportar" download>
                  <Download /> Exportar todos mis datos
                </a>
              </Button>
            )}
            {isAdmin && (access.kind === "active" || access.kind === "past_due") && latest && latest.status !== "pending" && <CancelSubscriptionButton />}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Planes</h2>
        {!isAdmin && <p className="text-muted-foreground text-sm">Solo un administrador puede elegir o cambiar el plan.</p>}
        <PlanPicker plans={options} canChoose={isAdmin} />
        <p className="text-muted-foreground text-xs">
          Precios en pesos, finales. Se ajustan cada tres meses por inflación, con aviso de 30 días. ¿Más de 300 contratos o varias sucursales?{" "}
          <Link href="mailto:hola@rentavle.com" className="underline">
            Escribinos
          </Link>
          .
        </p>
      </section>
    </>
  );
}
