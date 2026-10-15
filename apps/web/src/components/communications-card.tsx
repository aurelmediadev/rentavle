import { Mail, MessageCircle } from "lucide-react";
import { TYPE_LABEL } from "@rentavle/emails";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  queued: { label: "Enviando", variant: "outline" },
  sent: { label: "Enviado", variant: "secondary" },
  delivered: { label: "Entregado", variant: "default" },
  bounced: { label: "Rebotado", variant: "destructive" },
  failed: { label: "No enviado", variant: "destructive" },
};

export interface CommunicationRow {
  id: string;
  type: keyof typeof TYPE_LABEL;
  channel: "email" | "whatsapp_link";
  sender: "manual" | "automatic";
  toAddress: string;
  subject: string | null;
  status: keyof typeof STATUS;
  error: string | null;
  createdAt: Date;
}

/** Message history (emails sent, WhatsApp opened, automatic notices). */
export function CommunicationsCard({ rows, timezone }: { rows: CommunicationRow[]; timezone: string }) {
  const format = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: timezone });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comunicaciones</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no se envió nada.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const Icon = r.channel === "email" ? Mail : MessageCircle;
              const status = STATUS[r.status]!;
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm" aria-label={`${TYPE_LABEL[r.type]} a ${r.toAddress}`}>
                  <div className="flex min-w-0 gap-2">
                    <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate">
                        {TYPE_LABEL[r.type]}
                        {r.sender === "automatic" && <span className="text-muted-foreground"> · automático</span>}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {format.format(r.createdAt)} · {r.toAddress || "sin destinatario"}
                        {r.error && ` · ${r.error}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={status.variant}>{r.channel === "whatsapp_link" && r.status === "sent" ? "Abierto en WhatsApp" : status.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
