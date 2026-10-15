import Link from "next/link";
import { getSubscriptionState } from "@/lib/subscription";

/** Strip under the top bar: days left of the trial, payment problems or read-only account. */
export async function SubscriptionBanner() {
  const { access } = await getSubscriptionState();
  if (access.kind === "active") return null;
  const link = (
    <Link href="/suscripcion" className="font-medium underline underline-offset-2">
      {access.kind === "trial" ? "Elegir un plan" : access.kind === "past_due" ? "Ver suscripción" : "Suscribirme"}
    </Link>
  );
  if (access.kind === "trial") {
    if (access.daysLeft > 7) return null;
    return (
      <p role="status" className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        Te {access.daysLeft === 1 ? "queda 1 día" : `quedan ${access.daysLeft} días`} de prueba gratis. {link}
      </p>
    );
  }
  if (access.kind === "past_due") {
    return (
      <p role="status" className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        No pudimos cobrar la suscripción: MercadoPago lo va a reintentar. Revisá tu medio de pago. {link}
      </p>
    );
  }
  return (
    <p role="alert" className="bg-destructive/10 text-destructive border-b px-4 py-2 text-sm">
      {access.reason === "trial_ended" ? "Terminó tu prueba gratis" : "Tu suscripción no está activa"}: podés ver y exportar todo, pero no cargar
      datos nuevos. {link}
    </p>
  );
}
