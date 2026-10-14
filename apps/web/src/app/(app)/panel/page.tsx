import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asUser, getActiveMembership } from "@/lib/auth";

export const metadata: Metadata = { title: "Panel · Rentavle" };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY_MS));
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const membership = await getActiveMembership();
  const organization = await asUser(async (tx) => {
    const [row] = await tx
      .select({
        name: schema.organizations.name,
        status: schema.organizations.subscriptionStatus,
        trialEndsAt: schema.organizations.trialEndsAt,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, membership.organizationId));
    return row!;
  });

  const trialDaysLeft =
    organization.status === "trialing" && organization.trialEndsAt ? daysUntil(organization.trialEndsAt) : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
        {trialDaysLeft !== null && (
          <Badge variant="secondary">
            Prueba gratis · {trialDaysLeft} {trialDaysLeft === 1 ? "día" : "días"}
          </Badge>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta está lista</CardTitle>
          <CardDescription>
            Muy pronto vas a poder cargar propiedades, clientes y contratos desde acá. Mientras tanto, invitá a tu
            equipo desde Configuración → Usuarios.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
