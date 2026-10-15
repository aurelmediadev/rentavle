import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SearchInput } from "@/components/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { adminOrganizations, requirePlatformAdmin } from "@/lib/platform";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Panel interno · Rentavle", robots: { index: false } };

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Organizations searchParams={searchParams} />
    </Suspense>
  );
}

async function Organizations({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  // Nothing of the panel shows to anyone but staff.
  await requirePlatformAdmin();
  const { q } = await searchParams;
  const rows = await adminOrganizations(typeof q === "string" ? q : undefined);
  return (
    <div className="grid gap-6">
      <PageHeader title="Organizaciones" description="Inmobiliarias registradas, su suscripción y su uso." />
      <SearchInput placeholder="Buscar por nombre, CUIT o email" />
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay organizaciones que coincidan.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inmobiliaria</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell text-right">Contratos</TableHead>
                <TableHead className="hidden lg:table-cell">Alta</TableHead>
                <TableHead className="hidden lg:table-cell">Último pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/organizaciones/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">
                      {[o.tax_id && `CUIT ${o.tax_id}`, o.owner_email, `${o.members} ${o.members === 1 ? "usuario" : "usuarios"}`].filter(Boolean).join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.subscription_status} trialEndsAt={o.trial_ends_at} />
                    <span className="text-muted-foreground block text-xs">{o.plan_name ? `Plan ${o.plan_name}` : o.subscription_status === "active" ? "Sin cargo" : ""}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right tabular-nums">{o.active_contracts}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatDate(o.created_at)}</TableCell>
                  <TableCell className="hidden lg:table-cell">{o.last_payment_at ? formatDate(o.last_payment_at) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
