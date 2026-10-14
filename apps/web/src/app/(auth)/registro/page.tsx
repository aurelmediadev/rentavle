import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta · Rentavle" };

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Creá tu cuenta</CardTitle>
        <CardDescription>21 días de prueba gratis. Sin tarjeta.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <SignUpForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
