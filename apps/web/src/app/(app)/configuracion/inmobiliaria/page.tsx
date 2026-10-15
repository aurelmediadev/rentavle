import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { getCountryPack } from "@rentavle/country";
import { schema } from "@rentavle/db";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asUser, getActiveMembership } from "@/lib/auth";
import { brandingUrl } from "@/lib/documents";
import { AgencyForm, BrandingImageForm } from "./agency-forms";

export const metadata: Metadata = { title: "Inmobiliaria · Rentavle" };

export default function AgencyPage() {
  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inmobiliaria</h1>
        <p className="text-muted-foreground text-sm">Los datos, el logo y la firma que salen en los recibos y las liquidaciones.</p>
      </div>
      <Suspense fallback={<PageLoading />}>
        <Agency />
      </Suspense>
    </div>
  );
}

async function Agency() {
  const { organizationId, role, countryCode } = await getActiveMembership();
  if (role !== "admin") {
    return <p className="text-muted-foreground text-sm">Solo un administrador puede cambiar estos datos.</p>;
  }
  const [org] = await asUser((tx) => tx.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)));
  if (!org) return null;
  const pack = getCountryPack(countryCode);
  const initial = {
    name: org.name,
    legalName: org.legalName ?? "",
    taxId: org.taxId ? pack.taxId.format(org.taxId) : "",
    // "none" is the SelectField value for "Sin especificar".
    taxCondition: org.taxCondition ?? "none",
    address: org.address ?? "",
    phone: org.phone ?? "",
    email: org.email ?? "",
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
          <CardDescription>Un documento ya emitido no cambia: estos datos se usan en los próximos.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgencyForm
            initial={initial}
            taxIdLabel={pack.taxId.label}
            taxIdPlaceholder={pack.taxId.placeholder}
            taxConditions={[...pack.taxConditions]}
          />
        </CardContent>
      </Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>PNG o JPG de hasta 500 KB.</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandingImageForm kind="logo" url={brandingUrl(org.logoPath)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Firma</CardTitle>
            <CardDescription>Imagen de la firma, mejor con fondo transparente.</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandingImageForm kind="signature" url={brandingUrl(org.signaturePath)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
