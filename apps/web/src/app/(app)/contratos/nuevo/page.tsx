import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { countryFormOptions } from "@/lib/country";
import { currentMonthIn } from "@/lib/dates";
import { clientName, formatAddress } from "@/lib/format";
import { formatYearMonth } from "@rentavle/domain";
import { listClientOptions } from "../../clientes/data";
import { createContract } from "../actions";
import { ContractForm } from "../contract-form";
import { listIndexSeries, listPropertyOptions, renewalDefaults } from "../data";

export const metadata: Metadata = { title: "Nuevo contrato · Rentavle" };

export default function NewContractPage({ searchParams }: PageProps<"/contratos/nuevo">) {
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Nuevo contrato" back={{ href: "/contratos", label: "Contratos" }} />
      <Card>
        <CardContent>
          <Suspense fallback={<PageLoading />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/contratos/nuevo">, "searchParams">) {
  const { renovar, propiedad } = await searchParams;
  const [{ countryCode, timezone }, properties, clients, series] = await Promise.all([
    getActiveMembership(),
    listPropertyOptions(),
    listClientOptions(),
    listIndexSeries(),
  ]);
  const renewal = typeof renovar === "string" && /^\d+$/.test(renovar) ? await renewalDefaults(Number(renovar)) : null;
  const preselected =
    typeof propiedad === "string" ? (properties.find((p) => String(p.number) === propiedad)?.id ?? null) : null;

  return (
    <ContractForm
      action={createContract}
      properties={properties.map((p) => ({
        id: p.id,
        name: formatAddress(p, true),
        detail: p.owners.map(clientName).join(", "),
      }))}
      clients={clients.map((c) => ({ id: c.id, name: clientName(c), detail: c.docNumber }))}
      indexSeries={series.map((s) => ({ code: s.code, name: s.name }))}
      currencies={countryFormOptions(countryCode).currencies}
      defaultIndexSeries={countryFormOptions(countryCode).defaultIndexSeries}
      currentMonth={formatYearMonth(currentMonthIn(timezone))}
      defaults={renewal?.values}
      initialPropertyId={renewal?.propertyId ?? preselected}
      initialTenantIds={renewal?.tenantIds}
      initialGuarantorIds={renewal?.guarantorIds}
      renewedFrom={renewal ? { id: renewal.renewedFromContractId, number: renewal.renewedFromNumber } : null}
    />
  );
}
