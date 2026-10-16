"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { confirmFileUpload, prepareFileUpload, removeFile } from "@/app/(app)/files-actions";

export interface AttachedFile {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: Date;
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,.doc,.docx";
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/** Attachments of a contract, movement, client or property: list, upload (straight to Storage) and delete. */
export function FilesCard({
  entityType,
  entityId,
  files,
  title = "Archivos",
  description,
}: {
  entityType: "contract" | "movement" | "client" | "property";
  entityId: string;
  files: AttachedFile[];
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const meta = { entityType, entityId, filename: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size };
        const prepared = await prepareFileUpload(meta);
        if (!prepared.ok) {
          toast.error(`${file.name}: ${prepared.message}`);
          continue;
        }
        const { error } = await createSupabaseBrowserClient().storage.from("files").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: meta.mimeType });
        if (error) {
          toast.error(`${file.name}: no se pudo subir (${error.message})`);
          continue;
        }
        const confirmed = await confirmFileUpload({ ...meta, path: prepared.path });
        if (!confirmed.ok) toast.error(`${file.name}: ${confirmed.message}`);
        else toast.success(`${file.name} adjuntado`);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  }

  function remove(file: AttachedFile) {
    if (!window.confirm(`¿Borrar ${file.filename}?`)) return;
    startTransition(async () => {
      const result = await removeFile(file.id);
      if (!result.ok) toast.error(result.message);
      else toast.success("Archivo borrado");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label={`Adjuntar a ${title.toLowerCase()}`}
          onChange={(e) => void upload(e.target.files)}
        />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Paperclip /> {busy ? "Subiendo…" : "Adjuntar"}
        </Button>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin archivos. PDF, imágenes o Word de hasta 10 MB.</p>
        ) : (
          <ul className="divide-y text-sm" aria-label={title}>
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <a href={`/api/archivos/${f.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">{f.filename}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">{size(f.sizeBytes)}</span>
                </a>
                <Button variant="ghost" size="icon" aria-label={`Borrar ${f.filename}`} onClick={() => remove(f)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
