import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil } from "lucide-react";
import { getCountryPack } from "@rentavle/country";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { optionLabel } from "@/lib/country";
import { clientName, formatAddress } from "@/lib/format";
import { getPropertyByNumber } from "../data";
import { propertyStatusLabel, propertyTypeLabel } from "../labels";
import { ArchivePropertyButton } from "./property-actions";

export const metadata: Metadata = { title: "Propiedad · Rentavle" };

export default function PropertyPage({ params }: PageProps<"/propiedades/[numero]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PropertyDetail params={params} />
    </Suspense>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

async function PropertyDetail({ params }: Pick<PageProps<"/propiedades/[numero]">, "params">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [result, { countryCode }] = await Promise.all([getPropertyByNumber(number), getActiveMembership()]);
  if (!result) notFound();

  const { property, owners } = result;
  const pack = getCountryPack(countryCode);
  const archived = property.deletedAt !== null;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        back={{ href: "/propiedades", label: "Propiedades" }}
        title={
          <span className="flex items-center gap-2">
            {formatAddress(property)}
            <Badge variant={property.status === "rented" ? "default" : "secondary"}>{propertyStatusLabel(property.status)}</Badge>
            {archived && <Badge variant="outline">Archivada</Badge>}
          </span>
        }
        description={`Propiedad #${property.number} · ${propertyTypeLabel(property.type)}`}
        actions={
          <>
            <ArchivePropertyButton propertyId={property.id} archived={archived} />
            <Button asChild variant="outline">
              <Link href={`/propiedades/${property.number}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Dirección" value={formatAddress(property)} />
              <Item label="Localidad" value={property.city} />
              <Item label="Provincia" value={optionLabel(pack.regions, property.region)} />
              <Item label="Código postal" value={property.postalCode} />
              <Item label="Nomenclatura catastral" value={property.cadastralId} />
            </dl>
            {property.notes && <p className="bg-muted/50 mt-4 rounded-md p-3 text-sm whitespace-pre-wrap">{property.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Propietarios</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {owners.map((o) => (
                <li key={o.clientId} className="flex items-center justify-between gap-2">
                  <Link href={`/clientes/${o.clientNumber}`} className="hover:underline">
                    {clientName(o)}
                  </Link>
                  <span className="text-muted-foreground">{Number(o.ownershipPct)}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contratos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Los contratos de esta propiedad van a aparecer acá.</p>
        </CardContent>
      </Card>
    </div>
  );
}
