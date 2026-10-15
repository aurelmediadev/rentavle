import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Building2, Contact, FileText, Store } from "lucide-react";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMonth } from "@/lib/dates";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney } from "@/lib/numbers";
import { listDueUpdates } from "../contratos/actualizaciones/data";
import { listOwnersToSettle } from "../liquidaciones/data";
import { type Totals, dashboardSummary } from "./data";

export const metadata: Metadata = { title: "Panel · Rentavle" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Dashboard />
    </Suspense>
  );
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** "$ 1.500.000" or "$ 1.500.000 · US$ 200" (main currency first). */
function money(totals: Totals, main: string) {
  const entries = Object.entries(totals).sort(([a], [b]) => (a === main ? -1 : b === main ? 1 : a.localeCompare(b)));
  return entries.length ? entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") : formatMoney("0", main);
}

function Stat({ label, value, detail, href }: { label: string; value: string; detail?: string; href?: string }) {
  const body = (
    <Card className="h-full gap-1 py-4">
      <CardContent className="grid gap-1 px-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-semibold tabular-nums" aria-label={label}>
          {value}
        </p>
        {detail && <p className="text-muted-foreground text-xs">{detail}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="hover:[&>div]:border-foreground/20 block">
      {body}
    </Link>
  ) : (
    body
  );
}

async function Dashboard() {
  const [summary, updates, owners] = await Promise.all([dashboardSummary(), listDueUpdates(), listOwnersToSettle()]);
  const { org, today } = summary;
  const main = org.currency;
  const trialDaysLeft =
    org.status === "trialing" && org.trialEndsAt ? Math.max(0, daysBetween(today, org.trialEndsAt.toISOString().slice(0, 10))) : null;

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
      {trialDaysLeft !== null && (
        <Badge variant="secondary">
          Prueba gratis · {trialDaysLeft} {trialDaysLeft === 1 ? "día" : "días"}
        </Badge>
      )}
    </div>
  );

  if (summary.activeContracts === 0 && summary.overdue.length === 0) {
    const steps = [
      { href: "/configuracion/inmobiliaria", icon: Store, title: "Datos de la inmobiliaria", text: "Razón social, CUIT, logo y firma para los recibos." },
      { href: "/clientes/nuevo", icon: Contact, title: "Propietarios e inquilinos", text: "Con su email y celular, para mandarles recibos y avisos." },
      { href: "/propiedades/nueva", icon: Building2, title: "Propiedades", text: "Con sus propietarios y el porcentaje de cada uno." },
      { href: "/contratos/nuevo", icon: FileText, title: "Contratos", text: "También los que ya están en curso: se cargan desde el mes que quieras." },
    ];
    return (
      <div className="grid gap-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Primeros pasos</CardTitle>
            <CardDescription>Cuando cargues el primer contrato, acá vas a ver lo cobrado, lo pendiente, la mora y lo que hay que liquidar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {steps.map((s, i) => (
              <Link key={s.href} href={s.href} className="hover:bg-muted/50 flex gap-3 rounded-lg border p-4">
                <s.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-muted-foreground text-sm">{s.text}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" }).format(new Date(`${summary.monthStart}T00:00:00Z`));
  return (
    <div className="grid gap-6">
      {header}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Contratos activos"
          value={String(summary.activeContracts)}
          detail={summary.expiring.length ? `${summary.expiring.length} terminan en los próximos 60 días` : undefined}
          href="/contratos"
        />
        <Stat label={`Cobrado en ${monthName}`} value={money(summary.collected, main)} href="/movimientos" />
        <Stat label={`Pendiente de ${monthName}`} value={money(summary.pending, main)} detail={`De ${money(summary.billed, main)} del mes`} />
        <Stat
          label="Deuda vencida"
          value={money(summary.overdueTotals, main)}
          detail={summary.overdue.length ? `${summary.overdue.length} ${summary.overdue.length === 1 ? "contrato" : "contratos"}` : "Nadie debe nada vencido"}
        />
        <Stat label={`Honorarios de ${monthName}`} value={money(summary.fees, main)} detail="Según las liquidaciones del mes" href="/caja" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Deudas vencidas</CardTitle>
            <CardDescription>Alquileres y gastos impagos después del vencimiento.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.overdue.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay deudas vencidas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="hidden sm:table-cell">Vencida desde</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.overdue.map((o) => (
                    <TableRow key={`${o.contractId}-${o.currency}`}>
                      <TableCell>
                        <Link href={`/contratos/${o.contract.number}`} className="font-medium hover:underline">
                          #{o.contract.number} · {formatAddress(o.contract)}
                        </Link>
                        <span className="text-muted-foreground block text-xs">{o.tenants.map(clientName).join(", ") || "Sin inquilino"}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {formatDate(o.oldestDue)}
                        <span className="text-muted-foreground block text-xs">{daysBetween(o.oldestDue, today)} días</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(o.outstanding, o.currency)}</TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/contratos/${o.contract.number}/cobrar`}>Cobrar</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Actualizaciones</CardTitle>
              <Link href="/contratos/actualizaciones" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
                Ver todas <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {updates.rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sin aumentos este mes ni el próximo.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {updates.rows.slice(0, 6).map((r) => (
                    <li key={r.period.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/contratos/${r.contract.number}`} className="hover:underline">
                        #{r.contract.number} · {formatAddress(r.property)}
                        <span className="text-muted-foreground block text-xs">Desde {formatMonth(r.period.startMonth)}</span>
                      </Link>
                      <span className="text-right tabular-nums">
                        {r.period.amount ? formatMoney(r.period.amount, r.contract.currency) : <span className="text-muted-foreground">Esperando índice</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Para liquidar</CardTitle>
            </CardHeader>
            <CardContent>
              {owners.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hay cobros pendientes de liquidar.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {owners.slice(0, 6).map((o) => (
                    <li key={`${o.owner.id}-${o.currency}`} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/liquidaciones/nueva?propietario=${o.owner.number}&moneda=${o.currency}`} className="hover:underline">
                        {clientName(o.owner)}
                      </Link>
                      <span className="tabular-nums">{formatMoney(o.payout, o.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contratos por terminar</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.expiring.length === 0 ? (
                <p className="text-muted-foreground text-sm">Ningún contrato termina en los próximos 60 días.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {summary.expiring.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/contratos/${c.number}`} className="hover:underline">
                        #{c.number} · {formatAddress(c)}
                        <span className="text-muted-foreground block text-xs">{c.tenants.map(clientName).join(", ")}</span>
                      </Link>
                      <span className="text-right">
                        {formatDate(c.endDate)}
                        <span className="text-muted-foreground block text-xs">en {daysBetween(today, c.endDate)} días</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
