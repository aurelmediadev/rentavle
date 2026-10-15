import Decimal from "decimal.js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import type { ChargeRow, RecurringChargeRow } from "./charges-data";
import {
  ArchiveRecurringButton,
  ConfirmAmountDialog,
  GenerateNextMonthButton,
  OneOffChargeDialog,
  RecurringChargeDialog,
  VoidChargeDialog,
} from "./charge-dialogs";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Adeuda", variant: "destructive" },
  partially_paid: { label: "Pago parcial", variant: "secondary" },
  paid: { label: "Pagado", variant: "default" },
  void: { label: "Anulado", variant: "outline" },
};

const PARTY: Record<string, string> = {
  tenant: "Inquilino",
  owner: "Propietario",
  administration: "Administración",
  third_party: "Tercero",
};

function chargeTitle(c: ChargeRow, installments: number) {
  if (c.type === "rent") return `Alquiler ${formatMonth(c.periodMonth)} (${c.installmentNumber}/${installments})`;
  if (c.serviceMonth && c.serviceMonth !== c.periodMonth) return `${c.title} ${formatMonth(c.serviceMonth)}`;
  if (c.type === "recurring") return `${c.title} ${formatMonth(c.periodMonth)}`;
  return c.title;
}

export function ChargesSection({
  contractId,
  active,
  currency,
  installments,
  currentMonth,
  charges,
  templates,
}: {
  contractId: string;
  active: boolean;
  currency: string;
  installments: number;
  currentMonth: string;
  charges: ChargeRow[];
  templates: RecurringChargeRow[];
}) {
  // What is still owed: pending debts plus the unpaid part of partially paid ones.
  const pendingBy = (debtor: string) =>
    charges
      .filter((c) => (c.status === "pending" || c.status === "partially_paid") && c.debtor === debtor)
      .reduce((total, c) => total.plus(c.outstanding), new Decimal(0));
  const tenantOwes = pendingBy("tenant");
  const ownerOwes = pendingBy("owner");
  const months = [...new Set(charges.map((c) => c.periodMonth))];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Cuenta corriente</CardTitle>
            <CardDescription>
              Inquilino debe <span className="text-foreground font-medium tabular-nums">{formatMoney(tenantOwes.toFixed(2), currency)}</span>
              {!ownerOwes.isZero() && (
                <>
                  {" · "}Propietario debe{" "}
                  <span className="text-foreground font-medium tabular-nums">{formatMoney(ownerOwes.toFixed(2), currency)}</span>
                </>
              )}
            </CardDescription>
          </div>
          {active && (
            <div className="flex flex-wrap gap-2">
              <OneOffChargeDialog contractId={contractId} currentMonth={currentMonth} />
              <GenerateNextMonthButton contractId={contractId} />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay deudas generadas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="hidden sm:table-cell">A cargo de</TableHead>
                  <TableHead className="hidden md:table-cell">Vence</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((month) => (
                  <MonthRows
                    key={month}
                    month={month}
                    rows={charges.filter((c) => c.periodMonth === month)}
                    currency={currency}
                    installments={installments}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Gastos recurrentes</CardTitle>
            <CardDescription>Se agregan solos a la cuenta corriente cada período.</CardDescription>
          </div>
          {active && <RecurringChargeDialog contractId={contractId} currentMonth={currentMonth} />}
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin gastos recurrentes.</p>
          ) : (
            <ul className="divide-y text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{t.title}</span>{" "}
                    <span className="text-muted-foreground">
                      · {PARTY[t.debtor]} → {PARTY[t.creditor]} · desde {formatMonth(t.startMonth)}
                      {t.endMonth && ` hasta ${formatMonth(t.endMonth)}`} ·{" "}
                      {t.timing === "in_arrears" ? "vencido" : "adelantado"}
                      {t.requiresConfirmation && " · monto a confirmar"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatMoney(t.lastAmount, t.currency)}</span>
                    {active && <ArchiveRecurringButton id={t.id} title={t.title} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MonthRows({
  month,
  rows,
  currency,
  installments,
}: {
  month: string;
  rows: ChargeRow[];
  currency: string;
  installments: number;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={6} className="text-muted-foreground py-1.5 text-xs font-medium tracking-wide uppercase">
          {formatMonth(month)}
        </TableCell>
      </TableRow>
      {rows.map((c) => {
        const status = STATUS[c.status]!;
        const title = chargeTitle(c, installments);
        return (
          <TableRow key={c.id} className={cn(c.status === "void" && "text-muted-foreground line-through")}>
            <TableCell>
              {title}
              {c.calcExplanation && c.status === "pending" && (
                <span className="text-muted-foreground block text-xs no-underline">{c.calcExplanation}</span>
              )}
              {c.status === "void" && c.voidReason && (
                <span className="text-muted-foreground block text-xs">Anulada: {c.voidReason}</span>
              )}
            </TableCell>
            <TableCell className="hidden sm:table-cell">{PARTY[c.debtor]}</TableCell>
            <TableCell className="hidden md:table-cell">{formatDate(c.dueDate)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(c.amount, currency)}</TableCell>
            <TableCell>
              <span className="flex flex-wrap gap-1">
                <Badge variant={status.variant}>
                  {status.label}
                  {c.status === "partially_paid" && ` · debe ${formatMoney(c.outstanding, currency)}`}
                </Badge>
                {!c.isConfirmed && c.status === "pending" && <Badge variant="outline">A confirmar</Badge>}
              </span>
            </TableCell>
            <TableCell>
              {c.status === "pending" && (
                <span className="flex">
                  {c.type !== "rent" && <ConfirmAmountDialog chargeId={c.id} title={title} amount={c.amount} />}
                  <VoidChargeDialog chargeId={c.id} title={title} />
                </span>
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
