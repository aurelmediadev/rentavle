import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clientName, formatAddress } from "@/lib/format";
import { listProperties } from "./data";
import { propertyStatusLabel, propertyTypeLabel } from "./labels";

export const metadata: Metadata = { title: "Propiedades · Rentavle" };

export default function PropertiesPage({ searchParams }: PageProps<"/propiedades">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Propiedades"
        actions={
          <Button asChild>
            <Link href="/propiedades/nueva">
              <Plus /> Nueva propiedad
            </Link>
          </Button>
        }
      />
      <Suspense>
        <SearchInput placeholder="Buscar por dirección o propietario" />
      </Suspense>
      <Suspense fallback={<PageLoading />}>
        <PropertiesTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PropertiesTable({ searchParams }: Pick<PageProps<"/propiedades">, "searchParams">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const rows = await listProperties(query);

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        {query ? "No hay propiedades que coincidan con la búsqueda." : "Todavía no cargaste propiedades."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead className="hidden md:table-cell">Propietario/s</TableHead>
            <TableHead className="hidden sm:table-cell">Tipo</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="relative">
              <TableCell className="text-muted-foreground">{row.number}</TableCell>
              <TableCell className="font-medium">
                <Link href={`/propiedades/${row.number}`} className="after:absolute after:inset-0">
                  {formatAddress(row, true)}
                </Link>
              </TableCell>
              <TableCell className="hidden md:table-cell">{row.owners.map(clientName).join(", ") || "—"}</TableCell>
              <TableCell className="hidden sm:table-cell">{propertyTypeLabel(row.type)}</TableCell>
              <TableCell>
                <Badge variant={row.status === "rented" ? "default" : "secondary"}>{propertyStatusLabel(row.status)}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
