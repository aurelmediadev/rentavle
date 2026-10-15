import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatYearMonth, parseYearMonth } from "@rentavle/domain";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveMembership } from "@/lib/auth";
import { currentMonthIn, formatDate, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/numbers";
import { cashBook } from "../data";

export const metadata: Metadata = { title: "Libro de caja · Rentavle" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CashBookPage({ params, searchParams }: PageProps<"/caja/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CashBook params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CashBook({ params, searchParams }: Pick<PageProps<"/caja/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { mes } = await searchParams;
  const { timezone } = await getActiveMembership();
  const month = typeof mes === "string" && /^\d{4}-\d{2}$/.test(mes) ? parseYearMonth(mes) : currentMonthIn(timezone);
  const monthKey = formatYearMonth(month);
  const book = await cashBook(id, monthKey);
  if (!book) notFound();
  const { account } = book;
  const fmt = (v: string) => formatMoney(v, account.currency);
  const link = (offset: number) => `/caja/${account.id}?mes=${formatYearMonth(addMonths(month, offset))}`;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        back={{ href: "/caja", label: "Caja" }}
        title={
          <span className="flex items-center gap-2">
            {account.name}
            {account.archivedAt && <Badge variant="outline">Archivada</Badge>}
          </span>
        }
        description={`Libro de caja · ${account.currency}`}
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="Mes anterior">
              <Link href={link(-1)}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-24 text-center text-sm font-medium capitalize">{formatMonth(`${monthKey}-01`)}</span>
            <Button asChild variant="outline" size="icon" aria-label="Mes siguiente">
              <Link href={link(1)}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead className="text-right">Salida</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell />
              <TableCell className="text-muted-foreground">Saldo inicial</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right tabular-nums">{fmt(book.openingBalance)}</TableCell>
            </TableRow>
            {book.entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                <TableCell>
                  {e.movementNumber ? (
                    <Link href={`/movimientos/${e.movementNumber}`} className="hover:underline">
                      {e.concept}
                    </Link>
                  ) : (
                    e.concept
                  )}
                  {e.contractNumber && <span className="text-muted-foreground block text-xs">Contrato #{e.contractNumber}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{e.income ? fmt(e.income) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{e.outcome ? fmt(e.outcome) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(e.balance)}</TableCell>
              </TableRow>
            ))}
            {book.entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                  Sin movimientos en este mes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="font-medium">Saldo final</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(book.totalIn)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(book.totalOut)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmt(book.closingBalance)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
