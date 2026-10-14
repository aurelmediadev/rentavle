import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asUser, getActiveMembership } from "@/lib/auth";
import { formatMonth } from "@/lib/dates";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney, formatPercent } from "@/lib/numbers";
import { PERIOD_STATUS_LABEL, frequencyLabel } from "../labels";
import { listDueUpdates } from "./data";
import { AdjustPeriodDialog, IpcModeSelect, RecalculateButton } from "./update-controls";

export const metadata: Metadata = { title: "Actualizaciones · Rentavle" };

export default function UpdatesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Actualizaciones"
        description="Aumentos de este mes y del próximo. Se calculan solos cuando se publica el índice."
        back={{ href: "/contratos", label: "Contratos" }}
        actions={<RecalculateButton />}
      />
      <Suspense fallback={<PageLoading />}>
        <Updates />
      </Suspense>
    </div>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  calculated: "default",
  manually_adjusted: "default",
  provisional: "secondary",
  pending: "outline",
  pending_index: "outline",
};

async function Updates() {
  const [{ rows, thisMonth }, membership] = await Promise.all([listDueUpdates(), getActiveMembership()]);
  const settings = await asUser(async (tx) => {
    const [org] = await tx
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, membership.organizationId));
    return (org?.settings ?? {}) as { ipcMode?: "real" | "provisional" };
  });

  return (
    <div className="grid gap-6">
      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          No hay aumentos este mes ni el próximo.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Desde</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead className="hidden md:table-cell">Inquilino/s</TableHead>
                <TableHead className="hidden lg:table-cell">Actualización</TableHead>
                <TableHead className="text-right">Monto anterior</TableHead>
                <TableHead className="text-right">Aumento</TableHead>
                <TableHead className="text-right">Nuevo monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ period, contract, property, seriesName, tenants }) => (
                <TableRow key={period.id}>
                  <TableCell className={period.startMonth < thisMonth ? "text-destructive" : undefined}>
                    {formatMonth(period.startMonth)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/contratos/${contract.number}`} className="hover:underline">
                      #{contract.number} · {formatAddress(property)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{tenants.map(clientName).join(", ")}</TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {contract.updateMode === "fixed_pct" ? `${formatPercent(contract.fixedUpdatePct)} fijo` : seriesName}{" "}
                    · {frequencyLabel(contract.updateFrequencyMonths).toLowerCase()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(period.previousAmount, contract.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{period.variationPct ? formatPercent(period.variationPct) : "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {period.amount ? formatMoney(period.amount, contract.currency) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[period.status] ?? "outline"}>{PERIOD_STATUS_LABEL[period.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <AdjustPeriodDialog
                      periodId={period.id}
                      label={`período ${period.periodNumber} del contrato #${contract.number}`}
                      currentAmount={period.amount}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cálculo del IPC</CardTitle>
          <CardDescription>
            El INDEC publica el IPC de un mes a mediados del mes siguiente. Elegí si los aumentos usan solo valores
            publicados o estiman el último mes y se corrigen cuando sale el dato real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IpcModeSelect value={settings.ipcMode ?? "real"} disabled={membership.role !== "admin"} />
          {membership.role !== "admin" && (
            <p className="text-muted-foreground mt-2 text-xs">Solo un administrador puede cambiarlo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
