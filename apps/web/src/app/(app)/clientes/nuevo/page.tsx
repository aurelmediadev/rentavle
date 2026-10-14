import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { countryFormOptions } from "@/lib/country";
import { createClient } from "../actions";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Nuevo cliente · Rentavle" };

export default function NewClientPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Nuevo cliente" back={{ href: "/clientes", label: "Clientes" }} />
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
  const { countryCode } = await getActiveMembership();
  return (
    <ClientForm action={createClient} country={countryFormOptions(countryCode)} submitLabel="Crear cliente" cancelHref="/clientes" />
  );
}
