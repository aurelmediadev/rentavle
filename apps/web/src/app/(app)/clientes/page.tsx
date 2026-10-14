import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clientName } from "@/lib/format";
import { listClients } from "./data";

export const metadata: Metadata = { title: "Clientes · Rentavle" };

export default function ClientsPage({ searchParams }: PageProps<"/clientes">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Clientes"
        description="Propietarios, inquilinos y garantes. El rol de cada uno se define en el contrato."
        actions={
          <Button asChild>
            <Link href="/clientes/nuevo">
              <Plus /> Nuevo cliente
            </Link>
          </Button>
        }
      />
      <Suspense>
        <SearchInput placeholder="Buscar por nombre, documento, email o teléfono" />
      </Suspense>
      <Suspense fallback={<PageLoading />}>
        <ClientsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ClientsTable({ searchParams }: Pick<PageProps<"/clientes">, "searchParams">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const rows = await listClients(query);

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        {query ? "No hay clientes que coincidan con la búsqueda." : "Todavía no cargaste clientes."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden md:table-cell">Documento</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="relative">
              <TableCell className="text-muted-foreground">{row.number}</TableCell>
              <TableCell className="font-medium">
                <Link href={`/clientes/${row.number}`} className="after:absolute after:inset-0">
                  {clientName(row)}
                </Link>
              </TableCell>
              <TableCell className="hidden md:table-cell">{row.docNumber ?? "—"}</TableCell>
              <TableCell className="hidden md:table-cell">{row.email ?? "—"}</TableCell>
              <TableCell className="hidden lg:table-cell">{row.phone ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
