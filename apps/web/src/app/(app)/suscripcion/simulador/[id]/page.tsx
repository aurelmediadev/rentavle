import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asUser, getActiveMembership } from "@/lib/auth";
import { formatMoney } from "@/lib/numbers";
import { billingProvider } from "@/lib/subscription";
import { simulateDecision } from "../../actions";

export const metadata: Metadata = { title: "Simulador de pago · Rentavle" };

/** Stand-in for MercadoPago's checkout while there are no credentials (never in production). */
export default function SimulatorPage({ params }: PageProps<"/suscripcion/simulador/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Simulator params={params} />
    </Suspense>
  );
}

function simulatorEnabled() {
  try {
    return billingProvider().name === "simulated";
  } catch {
    // Production without MercadoPago credentials: no simulator either.
    return false;
  }
}

async function Simulator({ params }: Pick<PageProps<"/suscripcion/simulador/[id]">, "params">) {
  const { id } = await params;
  if (!simulatorEnabled()) notFound();
  const { organizationId } = await getActiveMembership();
  const [row] = await asUser((tx) =>
    tx
      .select({ sub: schema.subscriptions, planName: schema.plans.name })
      .from(schema.subscriptions)
      .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
      .where(and(eq(schema.subscriptions.organizationId, organizationId), eq(schema.subscriptions.providerSubscriptionId, id))),
  );
  if (!row) notFound();
  const { sub } = row;

  return (
    <div className="mx-auto grid max-w-md gap-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Simulador de MercadoPago</CardTitle>
          <CardDescription>
            Entorno de desarrollo sin credenciales de MercadoPago: no se cobra nada. Con credenciales, acá se abre el checkout real.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">
            Débito automático: <strong>Plan {row.planName}</strong>, {formatMoney(sub.amount, sub.currency)} {sub.cycle === "monthly" ? "por mes" : "por año"}, a nombre de{" "}
            {sub.payerEmail}.
          </p>
          {sub.status === "pending" ? (
            <div className="flex gap-2">
              <form action={simulateDecision.bind(null, id, "authorized")}>
                <Button type="submit">Aprobar débito</Button>
              </form>
              <form action={simulateDecision.bind(null, id, "cancelled")}>
                <Button type="submit" variant="outline">
                  Rechazar
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Esta suscripción ya fue procesada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
