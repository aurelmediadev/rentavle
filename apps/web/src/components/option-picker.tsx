"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PickerOption {
  id: string;
  /** Main text, also used for searching. */
  name: string;
  /** Secondary text shown on the right (document number, owner...). */
  detail?: string | null;
}

/** Searchable selector (clients, properties...). Excluded ids (already picked) are hidden. */
export function OptionPicker({
  options,
  value,
  onChange,
  exclude = [],
  placeholder = "Elegí una opción",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados.",
  createHref,
  createLabel,
  ariaLabel,
}: {
  options: PickerOption[];
  value: string | null;
  onChange: (id: string) => void;
  exclude?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  createHref?: string;
  createLabel?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((c) => c.id === value);

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
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options
                .filter((c) => c.id === value || !exclude.includes(c.id))
                .map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.detail ?? ""} ${c.id}`}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn(c.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.detail && <span className="text-muted-foreground truncate text-xs">{c.detail}</span>}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
          {createHref && (
            <a href={createHref} target="_blank" rel="noreferrer" className="hover:bg-accent flex items-center gap-2 border-t px-3 py-2 text-sm">
              <UserPlus className="size-4" /> {createLabel ?? "Crear nuevo"}
            </a>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
