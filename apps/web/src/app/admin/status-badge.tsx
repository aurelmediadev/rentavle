import { Badge } from "@/components/ui/badge";

const LABEL = {
  trialing: "Prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  read_only: "Suspendida",
  cancelled: "Cancelada",
} as const;

/** Subscription status; a trial that already ended shows as such. */
export function StatusBadge({ status, trialEndsAt }: { status: keyof typeof LABEL; trialEndsAt: string | null }) {
  const trialEnded = status === "trialing" && trialEndsAt !== null && new Date(trialEndsAt) <= new Date();
  const label = trialEnded ? "Prueba vencida" : LABEL[status];
  const variant = status === "active" ? "default" : status === "trialing" && !trialEnded ? "secondary" : status === "past_due" ? "outline" : "destructive";
  return <Badge variant={variant}>{label}</Badge>;
}
