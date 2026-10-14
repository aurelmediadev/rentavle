import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { countryFormOptions } from "@/lib/country";
import { clientName } from "@/lib/format";
import { editClient } from "../../actions";
import { ClientForm } from "../../client-form";
import { getClientByNumber } from "../../data";

export const metadata: Metadata = { title: "Editar cliente · Rentavle" };

export default function EditClientPage({ params }: PageProps<"/clientes/[numero]/editar">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditClient params={params} />
    </Suspense>
  );
}

async function EditClient({ params }: Pick<PageProps<"/clientes/[numero]/editar">, "params">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [result, { countryCode }] = await Promise.all([getClientByNumber(number), getActiveMembership()]);
  if (!result) notFound();

  const { client, contacts } = result;
  const defaults: Record<string, string> = {};
  for (const [key, value] of Object.entries(client)) {
    if (typeof value === "string") defaults[key] = value;
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={`Editar ${clientName(client)}`} back={{ href: `/clientes/${number}`, label: "Volver al cliente" }} />
      <Card>
        <CardContent>
          <ClientForm
            action={editClient.bind(null, client.id)}
            country={countryFormOptions(countryCode)}
            defaults={defaults}
            contacts={contacts.map((c) => ({ type: c.type, value: c.value, label: c.label ?? "" }))}
            submitLabel="Guardar cambios"
            cancelHref={`/clientes/${number}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
