import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

// Placeholder until the marketing site (Fase 1, item 13).
export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Logo />
        <Button asChild variant="ghost">
          <Link href="/ingresar">Ingresar</Link>
        </Button>
      </header>
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Rentavle cobra, actualiza, liquida y avisa por vos.
        </h1>
        <p className="text-muted-foreground text-lg text-balance">
          Administración de alquileres para inmobiliarias: aumentos por IPC e ICL, punitorios, recibos y liquidaciones
          sin cálculos manuales.
        </p>
        <Button asChild size="lg">
          <Link href="/registro">Probar gratis 21 días</Link>
        </Button>
      </main>
    </div>
  );
}
