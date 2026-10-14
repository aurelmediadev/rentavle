import type { Metadata } from "next";
import { Suspense } from "react";
import { availableCountries } from "@rentavle/country";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: "Bienvenida · Rentavle" };

export default function WelcomePage() {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Configurá tu inmobiliaria</CardTitle>
          <CardDescription>
            Con estos datos armamos tus recibos y liquidaciones. Podés completar el resto después.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Form />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function Form() {
  await requireUser();
  const countries = availableCountries.map((c) => ({
    code: c.code,
    name: c.name,
    taxIdLabel: c.taxId.label,
    taxIdPlaceholder: c.taxId.placeholder,
  }));
  return <OrganizationForm countries={countries} />;
}
