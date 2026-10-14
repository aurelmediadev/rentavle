import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Ingresar · Rentavle" };

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
        <CardDescription>Entrá a la administración de tus alquileres.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <SignInForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
