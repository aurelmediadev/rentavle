import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMonth } from "@/lib/dates";
import { listLatestIndexValues } from "../contratos/actualizaciones/data";

export const metadata: Metadata = { title: "Índices · Rentavle" };

export default function IndexesPage() {
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader title="Índices" description="Valores oficiales que usa Rentavle para calcular los aumentos. Se actualizan todos los días." />
      <Suspense fallback={<PageLoading />}>
        <Indexes />
      </Suspense>
    </div>
  );
}

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });

async function Indexes() {
  const list = await listLatestIndexValues();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {list.map(({ series, values }) => (
        <Card key={series.id}>
          <CardHeader>
            <CardTitle>{series.name}</CardTitle>
            <CardDescription>
              Fuente: {series.publisher}
              {series.sourceUrl && (
                <>
                  {" · "}
                  <a href={series.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    ver publicación
                  </a>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {values.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {series.code === "AR_CASA_PROPIA"
                  ? "Este índice no tiene una fuente automática; lo carga el equipo de Rentavle."
                  : "Todavía no hay valores descargados."}
              </p>
            ) : series.frequency === "daily" ? (
              <p className="text-sm">
                <span className="text-2xl font-semibold tabular-nums">{number.format(values[0]!.value as unknown as number)}</span>
                <span className="text-muted-foreground"> al {formatDate(values[0]!.date)}</span>
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Variación mensual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {values.slice(0, 12).map((v, i) => {
                    const previous = values[i + 1];
                    const variation = previous ? ((Number(v.value) / Number(previous.value) - 1) * 100).toFixed(1) : null;
                    return (
                      <TableRow key={v.date}>
                        <TableCell>{formatMonth(v.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number.format(v.value as unknown as number)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {variation ? `${variation.replace(".", ",")}%` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
