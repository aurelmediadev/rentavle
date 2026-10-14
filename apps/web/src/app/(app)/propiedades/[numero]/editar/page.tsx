import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { countryFormOptions } from "@/lib/country";
import { clientName, formatAddress } from "@/lib/format";
import { listClientOptions } from "../../../clientes/data";
import { editProperty } from "../../actions";
import { getPropertyByNumber } from "../../data";
import { PropertyForm } from "../../property-form";

export const metadata: Metadata = { title: "Editar propiedad · Rentavle" };

export default function EditPropertyPage({ params }: PageProps<"/propiedades/[numero]/editar">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditProperty params={params} />
    </Suspense>
  );
}

async function EditProperty({ params }: Pick<PageProps<"/propiedades/[numero]/editar">, "params">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [result, { countryCode }, clients] = await Promise.all([
    getPropertyByNumber(number),
    getActiveMembership(),
    listClientOptions(),
  ]);
  if (!result) notFound();

  const { property, owners } = result;
  const defaults: Record<string, string> = {};
  for (const [key, value] of Object.entries(property)) {
    if (typeof value === "string") defaults[key] = value;
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title={`Editar ${formatAddress(property)}`}
        back={{ href: `/propiedades/${number}`, label: "Volver a la propiedad" }}
      />
      <Card>
        <CardContent>
          <PropertyForm
            action={editProperty.bind(null, property.id)}
            country={countryFormOptions(countryCode)}
            clients={clients.map((c) => ({ id: c.id, name: clientName(c), detail: c.docNumber }))}
            defaults={defaults}
            owners={owners.map((o) => ({ clientId: o.clientId, pct: String(Number(o.ownershipPct)) }))}
            submitLabel="Guardar cambios"
            cancelHref={`/propiedades/${number}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
