import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clientName } from "@/lib/format";
import { formatMoney } from "@/lib/numbers";
import { listOwnersToSettle } from "./data";

export const metadata: Metadata = { title: "Liquidaciones · Rentavle" };

export default function SettlementsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Liquidaciones"
        description="Propietarios con cobros pendientes de liquidar. Las liquidaciones hechas están en Movimientos."
      />
      <Suspense fallback={<PageLoading />}>
        <Owners />
      </Suspense>
    </div>
  );
}

async function Owners() {
  const rows = await listOwnersToSettle();
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        No hay cobros pendientes de liquidar.
      </div>
    );
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Propietario</TableHead>
            <TableHead className="hidden md:table-cell">Contratos</TableHead>
            <TableHead className="text-right">Cobrado</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Honorarios</TableHead>
            <TableHead className="text-right">A liquidar</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.owner.id}-${r.currency}`}>
              <TableCell className="font-medium">{clientName(r.owner)}</TableCell>
              <TableCell className="hidden md:table-cell">{r.contracts.map((n) => `#${n}`).join(", ")}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.gross, r.currency)}</TableCell>
              <TableCell className="hidden sm:table-cell text-right tabular-nums">{formatMoney(r.fee, r.currency)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.payout, r.currency)}</TableCell>
              <TableCell>
                <Button asChild size="sm">
                  <Link href={`/liquidaciones/nueva?propietario=${r.owner.number}&moneda=${r.currency}`}>Liquidar</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
