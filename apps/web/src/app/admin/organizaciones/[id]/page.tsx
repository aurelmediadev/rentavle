import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/numbers";
import { adminOrganizationDetail, requirePlatformAdmin } from "@/lib/platform";
import { StatusBadge } from "../../status-badge";
import { AccessForm } from "./access-form";

export const metadata: Metadata = { title: "Organización · Panel interno", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS = [
  { value: "inicial", label: "Inicial" },
  { value: "profesional", label: "Profesional" },
  { value: "corporativo", label: "Corporativo" },
];

export default function OrganizationPage({ params }: PageProps<"/admin/organizaciones/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Organization params={params} />
    </Suspense>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

async function Organization({ params }: Pick<PageProps<"/admin/organizaciones/[id]">, "params">) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await adminOrganizationDetail(id);
  if (!detail) notFound();
  const { organization: o, usage } = detail;

  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/admin", label: "Organizaciones" }}
        title={
          <span className="flex items-center gap-2">
            {o.name} <StatusBadge status={o.subscription_status} trialEndsAt={o.trial_ends_at} />
          </span>
        }
        description={[o.legal_name, o.tax_id && `CUIT ${o.tax_id}`, o.country_code].filter(Boolean).join(" · ")}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos y uso</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Plan" value={o.plan_name ? `${o.plan_name}${o.extra_contract_blocks ? ` + ${o.extra_contract_blocks} bloques` : ""}` : o.subscription_status === "active" ? "Sin cargo" : null} />
              <Item label="Contratos activos" value={`${usage.active_contracts}${usage.limit !== null ? ` de ${usage.limit}` : " (sin límite)"}`} />
              <Item label="Fin de la prueba" value={o.trial_ends_at ? formatDate(o.trial_ends_at) : null} />
              <Item label="Alta" value={formatDate(o.created_at)} />
              <Item label="Clientes / propiedades" value={`${usage.clients} / ${usage.properties}`} />
              <Item label="Contacto" value={[o.email, o.phone].filter(Boolean).join(" · ")} />
            </dl>
            <h3 className="mt-6 mb-2 text-sm font-medium">Usuarios</h3>
            <ul className="divide-y text-sm">
              {detail.members.map((m) => (
                <li key={m.email} className="flex justify-between py-1.5">
                  <span>{m.email}</span>
                  <span className="text-muted-foreground">{m.role === "admin" ? "Administrador" : "Operador"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cambiar acceso</CardTitle>
          </CardHeader>
          <CardContent>
            <AccessForm
              organizationId={o.id}
              plans={PLANS}
              initial={{
                status: o.subscription_status,
                planCode: o.plan_code ?? "none",
                extraBlocks: String(o.extra_contract_blocks),
                trialEndsOn: o.trial_ends_at ? o.trial_ends_at.slice(0, 10) : "",
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suscripciones y pagos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {detail.subscriptions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nunca inició una suscripción.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                  <TableHead className="hidden md:table-cell">Creada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {s.plan} · {s.cycle === "monthly" ? "mensual" : "anual"}
                    </TableCell>
                    <TableCell>{s.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(s.amount, s.currency)}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs">
                      {s.provider} {s.provider_subscription_id}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatDate(s.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {detail.payments.length > 0 && (
            <ul className="divide-y text-sm">
              {detail.payments.map((p) => (
                <li key={p.provider_payment_id} className="flex justify-between py-1.5">
                  <span>
                    {formatDate(p.paid_at ?? p.created_at)} · {p.status}
                  </span>
                  <span className="tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de cambios</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.audit.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin cambios del equipo de Rentavle.</p>
          ) : (
            <ul className="divide-y text-sm" aria-label="Historial de cambios">
              {detail.audit.map((a, i) => (
                <li key={i} className="py-2">
                  <p>{a.details.note}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(a.created_at)} · {a.actor ?? "—"} · {String(a.details.before?.status)} → {String(a.details.after?.status)}
                    {a.details.after?.plan_code ? ` (plan ${String(a.details.after.plan_code)})` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
