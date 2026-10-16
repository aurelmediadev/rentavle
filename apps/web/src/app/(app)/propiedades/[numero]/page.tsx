import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { listPropertyContracts } from "../../contratos/data";
import { contractStatus } from "../../contratos/status";
import { formatDate, todayIn } from "@/lib/dates";
import { propertyStatusLabel, propertyTypeLabel } from "../labels";
import { FilesCard } from "@/components/files-card";
import { listFiles } from "@/lib/files";
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
  const [result, { countryCode, timezone }] = await Promise.all([getPropertyByNumber(number), getActiveMembership()]);
  if (!result) notFound();

  const { property, owners } = result;
  const [propertyContracts, attachments] = await Promise.all([listPropertyContracts(property.id), listFiles("property", property.id)]);
  const today = todayIn(timezone);
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contratos</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href={`/contratos/nuevo?propiedad=${property.number}`}>
              <Plus /> Nuevo contrato
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {propertyContracts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Esta propiedad todavía no tiene contratos.</p>
          ) : (
            <ul className="divide-y text-sm">
              {propertyContracts.map((c) => {
                const status = contractStatus(c, today);
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/contratos/${c.number}`} className="hover:underline">
                      #{c.number} · {c.tenants.map(clientName).join(", ")}
                    </Link>
                    <span className="text-muted-foreground flex items-center gap-2">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <FilesCard entityType="property" entityId={property.id} files={attachments} description="Escritura, planos, fotos, reglamento." />
    </div>
  );
}
