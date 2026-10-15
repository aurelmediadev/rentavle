import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { listMovements } from "./data";
import { MovementsTable } from "./movements-table";

export const metadata: Metadata = { title: "Movimientos · Rentavle" };

export default function MovementsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Movimientos" description="Cobros, liquidaciones y demás operaciones con dinero." />
      <Suspense fallback={<PageLoading />}>
        <Movements />
      </Suspense>
    </div>
  );
}

async function Movements() {
  const rows = await listMovements();
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        Todavía no hay movimientos. Los cobros se registran desde cada contrato.
      </div>
    );
  }
  return <MovementsTable rows={rows} />;
}
