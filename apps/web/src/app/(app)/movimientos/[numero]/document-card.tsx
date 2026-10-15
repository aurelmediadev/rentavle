"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, FileDown, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { shareDocument } from "./document-actions";
import { type Draft, EmailDocumentDialog, WhatsappDocumentDialog } from "./send-dialogs";

interface DocumentInfo {
  id: string;
  type: "receipt" | "settlement";
  number: number;
  status: "issued" | "void";
}

export function DocumentCard({ document, draft }: { document: DocumentInfo; draft: Draft | null }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const title = `${document.type === "receipt" ? "Recibo" : "Liquidación"} N° ${String(document.number).padStart(8, "0")}`;
  const pdf = `/api/documentos/${document.id}`;

  function share() {
    startTransition(async () => {
      const result = await shareDocument(document.id);
      if (!result.ok) return void toast.error(result.message);
      setLink(result);
      try {
        await navigator.clipboard.writeText(result.url);
        toast.success("Link copiado");
      } catch {
        // Clipboard not allowed: the link stays visible to copy by hand.
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {document.status === "void" && <Badge variant="outline">Anulado</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={pdf} target="_blank" rel="noopener">
              <FileDown /> Ver PDF
            </a>
          </Button>
          {document.type === "receipt" && (
            <Button asChild variant="outline">
              <a href={`${pdf}?formato=media`} target="_blank" rel="noopener">
                <FileDown /> Media hoja
              </a>
            </Button>
          )}
          {draft && document.status === "issued" && (
            <>
              <EmailDocumentDialog draft={draft} />
              <WhatsappDocumentDialog draft={draft} />
            </>
          )}
          <Button variant="outline" onClick={share} disabled={pending}>
            <Link2 /> {pending ? "Creando link…" : "Copiar link para compartir"}
          </Button>
        </div>
        {link && (
          <div className="grid gap-1">
            <div className="flex gap-2">
              <Input readOnly value={link.url} aria-label="Link para compartir" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copiar"
                onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success("Link copiado"), () => undefined)}
              >
                <Copy />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Cualquiera con el link puede ver el documento hasta el {new Date(link.expiresAt).toLocaleDateString("es-AR")}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
