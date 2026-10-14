import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { countryFormOptions } from "@/lib/country";
import { clientName } from "@/lib/format";
import { listClientOptions } from "../../clientes/data";
import { createProperty } from "../actions";
import { PropertyForm } from "../property-form";

export const metadata: Metadata = { title: "Nueva propiedad · Rentavle" };

export default function NewPropertyPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Nueva propiedad" back={{ href: "/propiedades", label: "Propiedades" }} />
      <Card>
        <CardContent>
          <Suspense fallback={<PageLoading />}>
            <Form />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function Form() {
  const [{ countryCode }, clients] = await Promise.all([getActiveMembership(), listClientOptions()]);
  return (
    <PropertyForm
      action={createProperty}
      country={countryFormOptions(countryCode)}
      clients={clients.map((c) => ({ id: c.id, number: c.number, name: clientName(c), docNumber: c.docNumber }))}
      submitLabel="Crear propiedad"
      cancelHref="/propiedades"
    />
  );
}
