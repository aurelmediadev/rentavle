import type { Metadata } from "next";
import Link from "next/link";
import {
  BellRing,
  Calculator,
  FileText,
  HandCoins,
  Landmark,
  LineChart,
  MessageCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Rentavle · Administración de alquileres para inmobiliarias",
  description:
    "Aumentos por IPC e ICL, punitorios, cobros, liquidaciones a propietarios, recibos y avisos automáticos. Probalo gratis 21 días.",
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: LineChart,
    title: "Aumentos automáticos",
    text: "IPC, ICL, Casa Propia o porcentaje fijo. Los índices se descargan solos de las fuentes oficiales y cada aumento muestra su cálculo.",
  },
  {
    icon: HandCoins,
    title: "Cobros sin cuentas a mano",
    text: "Punitorios por día de mora, pagos parciales, saldo a favor y cuatro formas de cobro. El recibo sale solo.",
  },
  {
    icon: Users,
    title: "Liquidaciones a propietarios",
    text: "Honorarios, gastos a su cargo y copropietarios con su porcentaje. Si el inquilino le pagó directo, también.",
  },
  {
    icon: Landmark,
    title: "Una caja que cuadra",
    text: "Contabilidad de partida doble por debajo: cada peso tiene origen y destino, con libro de caja por mes.",
  },
  {
    icon: FileText,
    title: "Recibos y liquidaciones en PDF",
    text: "Con tu logo, tu firma y el importe en letras. Original y duplicado, o media hoja.",
  },
  {
    icon: MessageCircle,
    title: "Email y WhatsApp",
    text: "Mandá recibos y liquidaciones con un clic. Recordatorios de pago, avisos de mora y de aumento automáticos.",
  },
];

const STEPS = [
  { title: "Cargá tus contratos", text: "También los que ya están en curso: empezás desde el mes actual, sin cargar historia." },
  { title: "Rentavle hace las cuentas", text: "Genera las deudas del mes, calcula aumentos y punitorios, y te avisa qué hay que cobrar." },
  { title: "Vos cobrás y liquidás", text: "Registrás el pago, sale el recibo, la caja se actualiza y el propietario recibe su liquidación." },
];

const FAQ = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: "No. La prueba dura 21 días con hasta 10 contratos. Al terminar, la cuenta queda en solo lectura hasta que elijas un plan: no se borra nada.",
  },
  {
    q: "¿Puedo cargar contratos que ya están en curso?",
    a: "Sí. Indicás desde qué mes empezar a registrar y el monto vigente; Rentavle arma los períodos de actualización que faltan.",
  },
  {
    q: "¿De dónde salen los índices?",
    a: "El IPC se descarga del INDEC (datos.gob.ar) y el ICL del Banco Central, todos los días. Podés ver cada valor usado en cada cálculo.",
  },
  {
    q: "¿Cuántos usuarios puedo tener?",
    a: "Ilimitados en todos los planes, con roles de administrador y operador. El precio depende solo de la cantidad de contratos activos.",
  },
  {
    q: "¿Mis datos son míos?",
    a: "Sí. Cada inmobiliaria está aislada de las demás y podés exportar todos tus datos cuando quieras, incluso si dejás de pagar.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="grid gap-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Rentavle cobra, actualiza, liquida y avisa por vos.</h1>
          <p className="text-muted-foreground text-lg text-balance">
            Administración de alquileres para inmobiliarias: aumentos por IPC e ICL, punitorios, recibos y liquidaciones a propietarios, sin
            cálculos manuales ni planillas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/registro">Probar gratis 21 días</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/precios">Ver precios</Link>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">Sin tarjeta. Usuarios ilimitados. Exportás tus datos cuando quieras.</p>
        </div>
        {/* What makes the difference: every number explains itself. */}
        <div className="bg-card grid gap-4 rounded-xl border p-6 shadow-sm" aria-label="Ejemplo de cobro">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calculator className="text-primary size-4" /> Cobro de octubre · Contrato #12
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt>Alquiler octubre</dt>
              <dd className="tabular-nums">$ 500.000</dd>
            </div>
            <div className="flex justify-between">
              <dt>
                Punitorios
                <span className="text-muted-foreground block text-xs">14 días de mora × 0,5% × $ 500.000</span>
              </dt>
              <dd className="tabular-nums">$ 35.000</dd>
            </div>
            <div className="flex justify-between">
              <dt>Expensas</dt>
              <dd className="tabular-nums">$ 80.000</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <dt>Total a cobrar</dt>
              <dd className="tabular-nums">$ 615.000</dd>
            </div>
          </dl>
          <div className="bg-muted/60 grid gap-1 rounded-lg p-3 text-sm">
            <p className="font-medium">Liquidación al propietario</p>
            <p className="text-muted-foreground">
              $ 535.000 cobrados − $ 53.500 de honorarios (10%)
              <span className="text-foreground block font-medium whitespace-nowrap">= $ 481.500 al propietario</span>
            </p>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <BellRing className="size-3.5" /> Recibo enviado por WhatsApp · Caja actualizada
          </p>
        </div>
      </section>

      <section id="funciones" className="bg-muted/40 border-y">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6">
          <div className="grid max-w-2xl gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">Todo lo que hoy hacés en Excel y WhatsApp</h2>
            <p className="text-muted-foreground">
              Cada contrato nuevo no debería sumar trabajo. Rentavle se encarga de la parte repetitiva y te deja controlar.
            </p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="bg-background grid content-start gap-2 rounded-xl border p-5">
                <f.icon className="text-primary size-5" aria-hidden />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Cómo funciona</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid content-start gap-2">
              <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-full text-sm font-semibold">{i + 1}</span>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-muted-foreground text-sm">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-muted/40 border-y">
        <div className="mx-auto grid max-w-3xl gap-6 px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="grid gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="bg-background group rounded-lg border p-4">
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="text-muted-foreground mt-2 text-sm">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl justify-items-center gap-5 px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-balance">Probalo con tus contratos reales</h2>
        <p className="text-muted-foreground text-balance">
          21 días gratis, sin tarjeta. Si querés, empezá con una inmobiliaria de ejemplo para conocerlo antes de cargar lo tuyo.
        </p>
        <Button asChild size="lg">
          <Link href="/registro">Crear mi cuenta</Link>
        </Button>
      </section>
    </>
  );
}
