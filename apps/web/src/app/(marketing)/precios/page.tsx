import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/numbers";
import { publicPlans } from "@/lib/public-plans";

export const metadata: Metadata = {
  title: "Precios · Rentavle",
  description: "Planes por cantidad de contratos activos, con usuarios ilimitados. 21 días de prueba gratis, sin tarjeta.",
  alternates: { canonical: "/precios" },
};

const INCLUDED = [
  "Usuarios ilimitados",
  "Aumentos por IPC, ICL y fijos",
  "Cobros, punitorios y recibos",
  "Liquidaciones y caja",
  "Avisos por email y WhatsApp",
  "Exportación completa de datos",
];

export default async function PricesPage() {
  // The public site sells in Argentina first (docs/06-roadmap.md); other countries get their own page.
  const plans = await publicPlans("AR");
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6">
      <div className="grid max-w-2xl gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Precios</h1>
        <p className="text-muted-foreground text-lg">
          Pagás según tus contratos activos. Todo incluido en todos los planes, con usuarios ilimitados. Pagando el año, 2 meses gratis.
        </p>
      </div>
      <ul className="grid gap-6 md:grid-cols-3">
        {plans.map((p, i) => (
          <li key={p.code} className={`grid content-start gap-4 rounded-xl border p-6 ${i === 1 ? "border-primary shadow-sm" : ""}`}>
            <div className="grid gap-1">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="text-muted-foreground text-sm">Hasta {p.maxActiveContracts} contratos activos</p>
            </div>
            <p>
              <span className="text-3xl font-semibold tabular-nums">{formatMoney(p.monthlyPrice, p.currency)}</span>
              <span className="text-muted-foreground"> por mes</span>
            </p>
            <p className="text-muted-foreground -mt-2 text-sm">o {formatMoney(p.annualPrice, p.currency)} por año</p>
            {p.extraBlockContracts && p.extraBlockPrice && (
              <p className="text-sm">
                +{p.extraBlockContracts} contratos por {formatMoney(p.extraBlockPrice, p.currency)} por mes
              </p>
            )}
            <ul className="grid gap-1.5 text-sm">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="text-primary size-4 shrink-0" aria-hidden /> {item}
                </li>
              ))}
            </ul>
            <Button asChild variant={i === 1 ? "default" : "outline"}>
              <Link href="/registro">Probar gratis 21 días</Link>
            </Button>
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground grid gap-2 text-sm">
        <p>Precios en pesos argentinos, finales. Se pagan con débito automático de MercadoPago y se ajustan cada tres meses por inflación, con 30 días de aviso.</p>
        <p>
          ¿Más de 300 contratos o varias sucursales?{" "}
          <a href="mailto:hola@rentavle.com" className="text-foreground underline">
            Escribinos
          </a>{" "}
          y armamos un plan a medida.
        </p>
      </div>
    </div>
  );
}
