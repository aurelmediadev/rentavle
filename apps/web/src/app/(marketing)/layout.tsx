import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Public site: landing, prices and legal pages. Static; no session reads here. */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Rentavle, inicio">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/#funciones">Funciones</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/precios">Precios</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/ingresar">Ingresar</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/registro">Probar gratis</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
          <div className="grid content-start gap-2">
            <Logo />
            <p>Administración de alquileres para inmobiliarias. Hecho en Argentina, pensado para Latinoamérica.</p>
          </div>
          <ul className="grid content-start gap-2">
            <li>
              <Link href="/precios" className="hover:text-foreground">
                Precios
              </Link>
            </li>
            <li>
              <Link href="/registro" className="hover:text-foreground">
                Probar gratis
              </Link>
            </li>
            <li>
              <Link href="/ingresar" className="hover:text-foreground">
                Ingresar
              </Link>
            </li>
          </ul>
          <ul className="grid content-start gap-2">
            <li>
              <Link href="/terminos" className="hover:text-foreground">
                Términos y condiciones
              </Link>
            </li>
            <li>
              <Link href="/privacidad" className="hover:text-foreground">
                Política de privacidad
              </Link>
            </li>
            <li>
              <a href="mailto:hola@rentavle.com" className="hover:text-foreground">
                hola@rentavle.com
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
