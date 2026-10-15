import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { formatDate, formatMonth, todayIn } from "@/lib/dates";
import { clientName } from "@/lib/format";
import { createSettlement } from "../actions";
import { settlementFormData } from "../data";
import { SettlementForm } from "./settlement-form";

export const metadata: Metadata = { title: "Nueva liquidación · Rentavle" };

export default function NewSettlementPage({ searchParams }: PageProps<"/liquidaciones/nueva">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewSettlement searchParams={searchParams} />
    </Suspense>
  );
}

async function NewSettlement({ searchParams }: Pick<PageProps<"/liquidaciones/nueva">, "searchParams">) {
  const { propietario, moneda } = await searchParams;
  const number = Number(propietario);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [data, { timezone, countryCode: _country }] = await Promise.all([settlementFormData(number), getActiveMembership()]);
  if (!data) notFound();
  const currency = typeof moneda === "string" && /^[A-Z]{3}$/.test(moneda) ? moneda : (data.items[0]?.currency ?? "ARS");
  const items = data.items.filter((i) => i.currency === currency);
  const debts = data.debts.filter((d) => d.currency === currency);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        title={`Liquidar a ${clientName(data.owner)}`}
        description="Se liquida solo lo cobrado al inquilino, descontando honorarios."
        back={{ href: "/liquidaciones", label: "Liquidaciones" }}
      />
      <Card>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay cobros pendientes de liquidar a este propietario.</p>
          ) : (
            <SettlementForm
              key={items.map((i) => i.allocationId).join("|") + debts.map((d) => d.id).join("|")}
              action={createSettlement.bind(null, data.owner.id, currency)}
              ownerId={data.owner.id}
              currency={currency}
              items={items.map((i) => ({ ...i, paymentLabel: `Cobro #${i.paymentNumber} · ${formatDate(i.paymentDate)}` }))}
              debts={debts.map((d) => ({ ...d, label: `${d.title} ${formatMonth(d.periodMonth)}` }))}
              accounts={data.accounts.filter((a) => a.currency === currency)}
              today={todayIn(timezone)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
