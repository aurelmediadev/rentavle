import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Mail, Pencil, Phone } from "lucide-react";
import { getCountryPack } from "@rentavle/country";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommunicationsCard } from "@/components/communications-card";
import { getActiveMembership } from "@/lib/auth";
import { communicationHistory } from "@/lib/communications";
import { countryFormOptions, optionLabel } from "@/lib/country";
import { clientName, formatAddress } from "@/lib/format";
import { getClientByNumber } from "../data";
import { ArchiveClientButton, BankAccountForm, RemoveBankAccountButton } from "./client-actions";

export const metadata: Metadata = { title: "Cliente · Rentavle" };

export default function ClientPage({ params }: PageProps<"/clientes/[numero]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ClientDetail params={params} />
    </Suspense>
  );
}

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" });

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

async function ClientDetail({ params }: Pick<PageProps<"/clientes/[numero]">, "params">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const [result, { countryCode, timezone }] = await Promise.all([getClientByNumber(number), getActiveMembership()]);
  if (!result) notFound();
  const history = await communicationHistory({ clientId: result.client.id });

  const { client, contacts, accounts, owned } = result;
  const pack = getCountryPack(countryCode);
  const archived = client.deletedAt !== null;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        back={{ href: "/clientes", label: "Clientes" }}
        title={
          <span className="flex items-center gap-2">
            {clientName(client)}
            {archived && <Badge variant="secondary">Archivado</Badge>}
          </span>
        }
        description={`Cliente #${client.number} · ${client.kind === "company" ? "Empresa" : "Persona"}`}
        actions={
          <>
            <ArchiveClientButton clientId={client.id} archived={archived} />
            <Button asChild variant="outline">
              <Link href={`/clientes/${client.number}/editar`}>
                <Pencil /> Editar
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Item
              label={optionLabel(pack.identityDocuments, client.docType) ?? "Documento"}
              value={client.docNumber}
            />
            <Item label={pack.taxId.label} value={client.taxId ? pack.taxId.format(client.taxId) : null} />
            <Item label="Condición fiscal" value={optionLabel(pack.taxConditions, client.taxCondition)} />
            {client.kind === "person" && (
              <>
                <Item label="Nacionalidad" value={client.nationality} />
                <Item
                  label="Fecha de nacimiento"
                  value={client.birthDate ? dateFormat.format(new Date(`${client.birthDate}T00:00:00Z`)) : null}
                />
              </>
            )}
            <Item
              label="Domicilio"
              value={
                client.street
                  ? [formatAddress(client, true), optionLabel(pack.regions, client.region), client.postalCode]
                      .filter(Boolean)
                      .join(" · ")
                  : null
              }
            />
          </dl>
          {client.notes && <p className="bg-muted/50 mt-4 rounded-md p-3 text-sm whitespace-pre-wrap">{client.notes}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin emails ni teléfonos.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    {c.type === "email" ? <Mail className="text-muted-foreground size-4" /> : <Phone className="text-muted-foreground size-4" />}
                    <a href={c.type === "email" ? `mailto:${c.value}` : `tel:${c.value}`} className="hover:underline">
                      {c.value}
                    </a>
                    {c.label && <span className="text-muted-foreground">({c.label})</span>}
                    {c.isPrimary && <Badge variant="outline">Principal</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Propiedades</CardTitle>
          </CardHeader>
          <CardContent>
            {owned.length === 0 ? (
              <p className="text-muted-foreground text-sm">No figura como propietario de ninguna propiedad.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {owned.map((p) => (
                  <li key={p.number} className="flex items-center justify-between gap-2">
                    <Link href={`/propiedades/${p.number}`} className="hover:underline">
                      {formatAddress(p, true)}
                    </Link>
                    {Number(p.ownershipPct) < 100 && <Badge variant="secondary">{Number(p.ownershipPct)}%</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas bancarias</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {accounts.length > 0 && (
            <ul className="divide-y rounded-md border text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="grid">
                    <span className="font-medium">
                      {[a.bankName, a.currency].filter(Boolean).join(" · ")}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {[a.cbu && `CBU/CVU ${a.cbu}`, a.alias && `Alias ${a.alias}`].filter(Boolean).join(" · ")}
                    </span>
                    {a.holderName && <span className="text-muted-foreground text-xs">Titular: {a.holderName}</span>}
                  </div>
                  <RemoveBankAccountButton bankAccountId={a.id} />
                </li>
              ))}
            </ul>
          )}
          <BankAccountForm clientId={client.id} currencies={countryFormOptions(countryCode).currencies} />
        </CardContent>
      </Card>

      <CommunicationsCard rows={history} timezone={timezone} />
    </div>
  );
}
