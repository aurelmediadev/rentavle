import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMonth } from "@/lib/dates";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney } from "@/lib/numbers";
import { getMovementByNumber } from "../data";
import { MOVEMENT_TYPE, PAYMENT_METHOD } from "../labels";
import { ReversePaymentDialog } from "./reverse-dialog";

export const metadata: Metadata = { title: "Movimiento · Rentavle" };

export default function MovementPage({ params, searchParams }: PageProps<"/movimientos/[numero]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Movement params={params} searchParams={searchParams} />
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

async function Movement({ params, searchParams }: Pick<PageProps<"/movimientos/[numero]">, "params" | "searchParams">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const { nuevo } = await searchParams;
  const data = await getMovementByNumber(number);
  if (!data) notFound();
  const { movement, contractNumber, property, client, account, allocations, credits } = data;
  const fmt = (v: string) => formatMoney(v, movement.currency);

  return (
    <div className="grid max-w-3xl gap-6">
      {nuevo && !movement.reversedAt && (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Cobro registrado. Los recibos en PDF y el envío por email llegan en los próximos pasos.
        </p>
      )}
      <PageHeader
        back={contractNumber ? { href: `/contratos/${contractNumber}`, label: `Contrato #${contractNumber}` } : { href: "/movimientos", label: "Movimientos" }}
        title={
          <span className="flex items-center gap-2">
            {MOVEMENT_TYPE[movement.type]} #{movement.number}
            {movement.reversedAt && <Badge variant="outline">Anulado</Badge>}
          </span>
        }
        description={formatDate(movement.date)}
        actions={!movement.reversedAt && movement.type === "tenant_payment" ? <ReversePaymentDialog movementId={movement.id} /> : null}
      />

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Item label="Monto recibido" value={<span className="text-lg font-semibold tabular-nums">{fmt(movement.amount)}</span>} />
            <Item label="Forma de pago" value={PAYMENT_METHOD[movement.method]} />
            <Item label="Ingresó en" value={account ?? (movement.method === "transfer_to_owner" ? "Directo al propietario" : null)} />
            <Item label="Pagó" value={client?.kind ? clientName(client as Parameters<typeof clientName>[0]) : null} />
            <Item
              label="Contrato"
              value={
                contractNumber ? (
                  <Link className="hover:underline" href={`/contratos/${contractNumber}`}>
                    #{contractNumber} · {formatAddress(property as Parameters<typeof formatAddress>[0])}
                  </Link>
                ) : null
              }
            />
            <Item
              label="Registrado por"
              value={[data.createdByFirst, data.createdByLast].filter(Boolean).join(" ")}
            />
          </dl>
          {movement.notes && <p className="bg-muted/50 mt-4 rounded-md p-3 text-sm">{movement.notes}</p>}
          {movement.reversedAt && (
            <p className="text-destructive mt-4 text-sm">Anulado: {movement.reverseReason}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {a.type === "rent" ? `Alquiler ${formatMonth(a.periodMonth)}` : a.type === "late_interest" ? `Punitorios ${formatMonth(a.periodMonth)}` : a.title}
                    {a.type === "late_interest" && a.explanation && (
                      <span className="text-muted-foreground block text-xs">{a.explanation}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(a.amount)}</TableCell>
                </TableRow>
              ))}
              {credits.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    Saldo a favor (queda para próximas deudas)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(c.amount.replace("-", ""))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt(movement.amount)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
