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
import { getActiveMembership } from "@/lib/auth";
import { formatDate, todayIn } from "@/lib/dates";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { type ContractListFilter, listContracts } from "./data";
import { contractStatus } from "./status";

export const metadata: Metadata = { title: "Contratos · Rentavle" };

const FILTERS: { value: ContractListFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "finished", label: "Finalizados" },
  { value: "all", label: "Todos" },
];

export default function ContractsPage({ searchParams }: PageProps<"/contratos">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Contratos"
        actions={
          <Button asChild>
            <Link href="/contratos/nuevo">
              <Plus /> Nuevo contrato
            </Link>
          </Button>
        }
      />
      <Suspense>
        <SearchInput placeholder="Buscar por dirección, inquilino, propietario o número" />
      </Suspense>
      <Suspense fallback={<PageLoading />}>
        <ContractsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ContractsTable({ searchParams }: Pick<PageProps<"/contratos">, "searchParams">) {
  const { q, estado } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const filter = FILTERS.some((f) => f.value === estado) ? (estado as ContractListFilter) : "active";
  const [rows, { timezone }] = await Promise.all([listContracts({ query, filter }), getActiveMembership()]);
  const today = todayIn(timezone);

  return (
    <div className="grid gap-4">
      <nav className="flex gap-1" aria-label="Filtrar contratos">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          if (f.value !== "active") params.set("estado", f.value);
          return (
            <Link
              key={f.value}
              href={`/contratos${params.size ? `?${params}` : ""}`}
              aria-current={f.value === filter ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                f.value === filter ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          {query ? "No hay contratos que coincidan con la búsqueda." : "No hay contratos para mostrar."}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Propiedad</TableHead>
                <TableHead className="hidden md:table-cell">Inquilino/s</TableHead>
                <TableHead className="hidden lg:table-cell">Vigencia</TableHead>
                <TableHead className="text-right">Alquiler</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ contract, property, tenants, currentAmount }) => {
                const status = contractStatus(contract, today);
                return (
                  <TableRow key={contract.id} className="relative">
                    <TableCell className="text-muted-foreground">{contract.number}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/contratos/${contract.number}`} className="after:absolute after:inset-0">
                        {formatAddress(property)}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{tenants.map(clientName).join(", ")}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(currentAmount, contract.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
