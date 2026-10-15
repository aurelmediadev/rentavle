import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { durationLabel, installmentCount } from "@rentavle/domain";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveMembership } from "@/lib/auth";
import { currentMonthIn, formatDate, formatMonth, todayIn } from "@/lib/dates";
import { formatYearMonth } from "@rentavle/domain";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney, formatPercent } from "@/lib/numbers";
import { getContractByNumber } from "../data";
import {
  COLLECTION_METHOD_OPTIONS,
  EVENT_LABEL,
  LATE_INTEREST_FROM_OPTIONS,
  PERIOD_STATUS_LABEL,
  frequencyLabel,
  optionText,
} from "../labels";
import { contractStatus } from "../status";
import { ContractActions } from "./contract-actions";
import { listMovements } from "../../movimientos/data";
import { MovementsTable } from "../../movimientos/movements-table";
import { Button } from "@/components/ui/button";
import { HandCoins } from "lucide-react";
import { getContractCharges } from "./charges-data";
import { ChargesSection } from "./charges-section";
import { AdjustPeriodDialog } from "../actualizaciones/update-controls";

export const metadata: Metadata = { title: "Contrato · Rentavle" };

export default function ContractPage({ params }: PageProps<"/contratos/[numero]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ContractDetail params={params} />
    </Suspense>
  );
}

const indexNumber = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });
function formatIndex(value: string | null) {
  return value ? indexNumber.format(value as unknown as number) : "—";
}
/** Daily series (ICL) show the day; monthly ones the month. */
function formatMonthOrDay(date: string, seriesCode: string | undefined) {
  return seriesCode === "AR_ICL" ? formatDate(date) : formatMonth(date);
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

async function ContractDetail({ params }: Pick<PageProps<"/contratos/[numero]">, "params">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [result, { timezone }] = await Promise.all([getContractByNumber(number), getActiveMembership()]);
  if (!result) notFound();

  const { contract, property, series, parties, periods, events, renewedTo, renewedFrom } = result;
  const today = todayIn(timezone);
  const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const status = contractStatus(contract, today);
  const term = { startDate: contract.startDate, endDate: contract.endDate };
  const owners = parties.filter((p) => p.role === "owner");
  const tenants = parties.filter((p) => p.role === "tenant");
  const guarantors = parties.filter((p) => p.role === "guarantor");
  const current = [...periods].reverse().find((p) => p.amount !== null);
  const [{ charges, templates }, payments] = await Promise.all([
    getContractCharges(contract.id),
    listMovements({ contractId: contract.id, limit: 50 }),
  ]);
  const hasOpenDebts = charges.some((c) => (c.status === "pending" || c.status === "partially_paid") && c.debtor === "tenant");

  const updateText =
    contract.updateMode === "none"
      ? "Sin actualización"
      : contract.updateMode === "fixed_pct"
        ? `${formatPercent(contract.fixedUpdatePct)} ${frequencyLabel(contract.updateFrequencyMonths).toLowerCase()}`
        : `${series?.name ?? "Índice"} · ${frequencyLabel(contract.updateFrequencyMonths)}`;

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        back={{ href: "/contratos", label: "Contratos" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {formatAddress(property)}
            <Badge variant={status.variant}>{status.label}</Badge>
          </span>
        }
        description={`Contrato #${contract.number} · ${formatDate(contract.startDate)} – ${formatDate(contract.endDate)} (${durationLabel(term)}, ${installmentCount(term)} cuotas)`}
        actions={
          <>
          {hasOpenDebts && (
            <Button asChild>
              <Link href={`/contratos/${contract.number}/cobrar`}>
                <HandCoins /> Registrar cobro
              </Link>
            </Button>
          )}
          <ContractActions
            contractId={contract.id}
            number={contract.number}
            status={contract.status}
            endDate={contract.endDate}
            hasTermination={contract.endDate < contract.originalEndDate}
          />
          </>
        }
      />

      {(renewedTo || renewedFrom) && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          {renewedFrom && (
            <>
              Renovación del{" "}
              <Link className="underline underline-offset-4" href={`/contratos/${renewedFrom.number}`}>
                contrato #{renewedFrom.number}
              </Link>
              .{" "}
            </>
          )}
          {renewedTo && (
            <>
              Renovado por el{" "}
              <Link className="underline underline-offset-4" href={`/contratos/${renewedTo.number}`}>
                contrato #{renewedTo.number}
              </Link>
              .
            </>
          )}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Alquiler vigente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(current?.amount, contract.currency)}</p>
            <p className="text-muted-foreground text-sm">{updateText}</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Partes</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Propietario/s", list: owners },
                { label: "Inquilino/s", list: tenants },
                { label: "Garante/s", list: guarantors },
              ].map(({ label, list }) => (
                <Item
                  key={label}
                  label={label}
                  value={
                    list.length ? (
                      <ul className="grid gap-0.5">
                        {list.map((p) => (
                          <li key={p.clientId}>
                            <Link href={`/clientes/${p.clientNumber}`} className="hover:underline">
                              {clientName(p)}
                            </Link>
                            {p.sharePct && Number(p.sharePct) < 100 && (
                              <span className="text-muted-foreground"> ({formatPercent(p.sharePct)})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null
                  }
                />
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Item
              label="Honorarios"
              value={
                contract.feeType === "pct"
                  ? `${formatPercent(contract.feeValue)} de lo cobrado`
                  : `${formatMoney(contract.feeValue, contract.currency)} por mes`
              }
            />
            <Item
              label="Punitorios"
              value={
                Number(contract.lateInterestDailyPct) > 0
                  ? `${formatPercent(contract.lateInterestDailyPct)} diario · ${optionText(LATE_INTEREST_FROM_OPTIONS, contract.lateInterestFrom).toLowerCase()}`
                  : "No cobra"
              }
            />
            <Item label="Vencimiento" value={`Día ${contract.dueDay} de cada mes`} />
            <Item label="Forma de cobro" value={optionText(COLLECTION_METHOD_OPTIONS, contract.collectionMethod)} />
            <Item label="Primer mes registrado" value={formatMonth(contract.firstBilledMonth)} />
            <Item label="Honorarios sobre punitorios" value={contract.feesOnLateInterest ? "Sí" : "No"} />
            {contract.endDate !== contract.originalEndDate && (
              <Item label="Fin original" value={formatDate(contract.originalEndDate)} />
            )}
          </dl>
          {contract.notes && <p className="bg-muted/50 mt-4 rounded-md p-3 text-sm whitespace-pre-wrap">{contract.notes}</p>}
        </CardContent>
      </Card>

      <ChargesSection
        contractId={contract.id}
        active={contract.status === "active"}
        currency={contract.currency}
        installments={installmentCount(term)}
        currentMonth={formatYearMonth(currentMonthIn(timezone))}
        charges={charges}
        templates={templates}
      />

      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cobros</CardTitle>
          </CardHeader>
          <CardContent>
            <MovementsTable rows={payments} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Períodos de actualización</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Meses</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Aumento</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.periodNumber}</TableCell>
                  <TableCell>
                    {formatMonth(p.startMonth)} – {formatMonth(p.endMonth)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {PERIOD_STATUS_LABEL[p.status]}
                    {p.indexStartDate && p.indexEndDate && (
                      <span className="block text-xs">
                        {series?.name.split(" ")[0]} {formatMonthOrDay(p.indexStartDate, series?.code)} ({formatIndex(p.indexStartValue)}) →{" "}
                        {formatMonthOrDay(p.indexEndDate, series?.code)} ({formatIndex(p.indexEndValue)})
                      </span>
                    )}
                    {p.status === "manually_adjusted" && p.notes && <span className="block text-xs">{p.notes}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.variationPct ? formatPercent(p.variationPct) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.amount ? formatMoney(p.amount, contract.currency) : "—"}</TableCell>
                  <TableCell>
                    {contract.status === "active" && p.periodNumber > 1 && p.status !== "not_billed" && p.status !== "initial" && (
                      <AdjustPeriodDialog
                        periodId={p.id}
                        label={`período ${p.periodNumber}`}
                        currentAmount={p.amount}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 text-sm">
            {events.map((e) => {
              const payload = e.payload as { previousEndDate?: string; newEndDate?: string; newContractNumber?: number };
              return (
                <li key={e.id} className="grid gap-0.5 border-l-2 pl-3">
                  <span className="font-medium">
                    {EVENT_LABEL[e.type] ?? e.type}
                    {payload.newEndDate && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · fin {formatDate(payload.previousEndDate)} → {formatDate(payload.newEndDate)}
                      </span>
                    )}
                    {payload.newContractNumber && (
                      <span className="text-muted-foreground font-normal"> · contrato #{payload.newContractNumber}</span>
                    )}
                  </span>
                  {e.reason && <span>{e.reason}</span>}
                  <span className="text-muted-foreground text-xs">
                    {dateTime.format(e.createdAt)} · {[e.firstName, e.lastName].filter(Boolean).join(" ") || "Sistema"}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
