"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ClientOption {
  id: string;
  number: number;
  name: string;
  docNumber: string | null;
}

/** Searchable client selector. Excluded ids (already picked) are hidden. */
export function ClientPicker({
  clients,
  value,
  onChange,
  exclude = [],
  placeholder = "Elegí un cliente",
  newClientHref,
  ariaLabel,
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string) => void;
  exclude?: string[];
  placeholder?: string;
  newClientHref?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Buscar por nombre o documento…" />
          <CommandList>
            <CommandEmpty>No encontramos clientes.</CommandEmpty>
            <CommandGroup>
              {clients
                .filter((c) => c.id === value || !exclude.includes(c.id))
                .map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.docNumber ?? ""} #${c.number}`}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn(c.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.docNumber && <span className="text-muted-foreground text-xs">{c.docNumber}</span>}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
          {newClientHref && (
            <a href={newClientHref} target="_blank" rel="noreferrer" className="hover:bg-accent flex items-center gap-2 border-t px-3 py-2 text-sm">
              <UserPlus className="size-4" /> Crear cliente nuevo
            </a>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
