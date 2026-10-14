"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveProperty } from "../actions";

export function ArchivePropertyButton({ propertyId, archived }: { propertyId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!archived && !confirm("¿Archivar esta propiedad? Deja de aparecer en listados; no se borra nada.")) return;
        startTransition(() => archiveProperty(propertyId, !archived));
      }}
    >
      {archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "Restaurar" : "Archivar"}
    </Button>
  );
}
