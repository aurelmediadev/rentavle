import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Invitación · Rentavle" };

export default function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Te invitaron a Rentavle</CardTitle>
          <CardDescription>Sumate al equipo de la inmobiliaria que te invitó.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <Invitation params={params} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function Invitation({ params }: Pick<PageProps<"/invitacion/[token]">, "params">) {
  const { token } = await params;
  const user = await getCurrentUser();
  const next = encodeURIComponent(`/invitacion/${token}`);

  if (!user) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">Ingresá o creá tu cuenta con el email que recibió la invitación.</p>
        <Button asChild>
          <Link href={`/registro?next=${next}`}>Crear cuenta</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/ingresar?next=${next}`}>Ya tengo cuenta</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Vas a aceptar como <span className="text-foreground font-medium">{user.email}</span>.
      </p>
      <AcceptButton token={token} />
    </div>
  );
}
